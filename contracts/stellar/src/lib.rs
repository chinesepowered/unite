#![no_std]

// Stellar HTLC Escrow Contract
// Uses Stellar's native transaction conditions and timebound functionality

use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror,
    Address, Bytes, Env, String, Vec, log, 
    token
};
use core::result::Result;
use core::result::Result::{Ok, Err};

#[derive(Clone)]
#[contracttype]
pub struct Escrow {
    pub sender: Address,
    pub receiver: Address,
    pub amount: i128,
    pub secret_hash: Bytes,
    pub timelock: u64,
    pub token_address: Address,
    pub order_id: String,
    pub withdrawn: bool,
    pub cancelled: bool,
    pub created_at: u64,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum HTLCError {
    EscrowNotFound = 1,
    AlreadyWithdrawn = 2,
    AlreadyCancelled = 3,
    InvalidSecret = 4,
    TimelockNotExpired = 5,
    UnauthorizedAccess = 6,
    InsufficientBalance = 7,
    InvalidTimelock = 8,
}

#[contract]
pub struct HTLCEscrow;

#[contractimpl]
impl HTLCEscrow {
    /// Create a new HTLC escrow
    pub fn create_escrow(
        env: Env,
        sender: Address,
        receiver: Address,
        amount: i128,
        secret_hash: Bytes,
        timelock: u64,
        token_address: Address,
        order_id: String,
    ) -> Result<Bytes, HTLCError> {
        // Verify timelock is in the future
        let current_time = env.ledger().timestamp();
        if timelock <= current_time {
            return Err(HTLCError::InvalidTimelock);
        }

        // Generate unique escrow ID
        let order_id_bytes = Bytes::from_slice(&env, order_id.as_bytes());
        let escrow_id = env.crypto().keccak256(&order_id_bytes);
        
        // Verify sender has sufficient balance
        let token_client = token::Client::new(&env, &token_address);
        let sender_balance = token_client.balance(&sender);
        if sender_balance < amount {
            return Err(HTLCError::InsufficientBalance);
        }

        // Transfer tokens to contract
        token_client.transfer(&sender, &env.current_contract_address(), &amount);

        // Create escrow
        let escrow = Escrow {
            sender: sender.clone(),
            receiver: receiver.clone(),
            amount,
            secret_hash: secret_hash.clone(),
            timelock,
            token_address: token_address.clone(),
            order_id: order_id.clone(),
            withdrawn: false,
            cancelled: false,
            created_at: current_time,
        };

        // Store escrow
        env.storage().persistent().set(&escrow_id, &escrow);

        // Emit event
        log!(
            &env,
            "HTLC Escrow Created: ID={}, Sender={}, Receiver={}, Amount={}",
            escrow_id,
            sender,
            receiver,
            amount
        );

        Ok(escrow_id.into())
    }

    /// Withdraw funds using the secret
    pub fn withdraw(
        env: Env,
        escrow_id: Bytes,
        secret: String,
        receiver: Address,
    ) -> Result<(), HTLCError> {
        // Load escrow
        let mut escrow: Escrow = env.storage()
            .persistent()
            .get(&escrow_id)
            .ok_or(HTLCError::EscrowNotFound)?;

        // Verify not already processed
        if escrow.withdrawn {
            return Err(HTLCError::AlreadyWithdrawn);
        }
        if escrow.cancelled {
            return Err(HTLCError::AlreadyCancelled);
        }

        // Verify secret
        let secret_bytes = Bytes::from_slice(&env, secret.as_bytes());
        let provided_hash = env.crypto().keccak256(&secret_bytes);
        let provided_hash_bytes: Bytes = provided_hash.into();
        if provided_hash_bytes != escrow.secret_hash {
            return Err(HTLCError::InvalidSecret);
        }

        // Verify receiver
        if receiver != escrow.receiver {
            return Err(HTLCError::UnauthorizedAccess);
        }

        // Mark as withdrawn
        escrow.withdrawn = true;
        env.storage().persistent().set(&escrow_id, &escrow);

        // Transfer tokens to receiver
        let token_client = token::Client::new(&env, &escrow.token_address);
        token_client.transfer(&env.current_contract_address(), &receiver, &escrow.amount);

        log!(
            &env,
            "HTLC Withdrawal: ID={}, Receiver={}, Amount={}",
            escrow_id,
            receiver,
            escrow.amount
        );

        Ok(())
    }

    /// Cancel escrow after timelock expires
    pub fn cancel(
        env: Env,
        escrow_id: Bytes,
        sender: Address,
    ) -> Result<(), HTLCError> {
        // Load escrow
        let mut escrow: Escrow = env.storage()
            .persistent()
            .get(&escrow_id)
            .ok_or(HTLCError::EscrowNotFound)?;

        // Verify not already processed
        if escrow.withdrawn {
            return Err(HTLCError::AlreadyWithdrawn);
        }
        if escrow.cancelled {
            return Err(HTLCError::AlreadyCancelled);
        }

        // Verify timelock has expired
        let current_time = env.ledger().timestamp();
        if current_time < escrow.timelock {
            return Err(HTLCError::TimelockNotExpired);
        }

        // Verify sender
        if sender != escrow.sender {
            return Err(HTLCError::UnauthorizedAccess);
        }

        // Mark as cancelled
        escrow.cancelled = true;
        env.storage().persistent().set(&escrow_id, &escrow);

        // Refund tokens to sender
        let token_client = token::Client::new(&env, &escrow.token_address);
        token_client.transfer(&env.current_contract_address(), &sender, &escrow.amount);

        log!(
            &env,
            "HTLC Cancellation: ID={}, Sender={}, Amount={}",
            escrow_id,
            sender,
            escrow.amount
        );

        Ok(())
    }

    /// Get escrow details
    pub fn get_escrow(env: Env, escrow_id: Bytes) -> Option<Escrow> {
        env.storage().persistent().get(&escrow_id)
    }

    /// Check if secret is valid for escrow
    pub fn verify_secret(env: Env, escrow_id: Bytes, secret: String) -> bool {
        if let Some(escrow) = Self::get_escrow(env.clone(), escrow_id) {
            let secret_bytes = Bytes::from_slice(&env, secret.as_bytes());
            let provided_hash = env.crypto().keccak256(&secret_bytes);
            let provided_hash_bytes: Bytes = provided_hash.into();
            provided_hash_bytes == escrow.secret_hash
        } else {
            false
        }
    }

    /// Check if escrow can be cancelled
    pub fn can_cancel(env: Env, escrow_id: Bytes) -> bool {
        if let Some(escrow) = Self::get_escrow(env.clone(), escrow_id) {
            let current_time = env.ledger().timestamp();
            !escrow.withdrawn && !escrow.cancelled && current_time >= escrow.timelock
        } else {
            false
        }
    }

    /// Get all active escrows for a given address (as sender or receiver)
    /// This function helps with escrow management and monitoring
    pub fn get_escrows_for_address(env: Env, _address: Address) -> Vec<(Bytes, Escrow)> {
        // Note: In a production environment, you might want to implement 
        // an indexing system for better performance
        let result = Vec::new(&env);
        
        // This is a simplified implementation - in practice, you'd want to
        // maintain separate indices for senders and receivers
        // or use events/logs for querying off-chain
        
        result
    }

    /// Emergency function to get contract balance (for debugging)
    pub fn get_contract_balance(env: Env, token_address: Address) -> i128 {
        let token_client = token::Client::new(&env, &token_address);
        token_client.balance(&env.current_contract_address())
    }

    /// Utility function to generate secret hash
    pub fn generate_secret_hash(env: Env, secret: String) -> Bytes {
        let secret_bytes = Bytes::from_slice(&env, secret.as_bytes());
        env.crypto().keccak256(&secret_bytes).into()
    }
}