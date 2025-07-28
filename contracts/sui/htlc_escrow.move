// Sui Move HTLC Escrow Module
// Implements atomic cross-chain swaps with hashlock and timelock

module htlc_escrow::escrow {
    use sui::object::{Self, UID, ID};
    use sui::transfer;
    use sui::context::{Self, TxContext};
    use sui::coin::{Self, Coin};
    use sui::clock::{Self, Clock};
    use sui::event;
    use sui::hash;
    use std::vector;
    use std::string::{Self, String};

    /// Error codes
    const EInvalidTimelock: u64 = 1;
    const EAlreadyWithdrawn: u64 = 2;
    const EAlreadyCancelled: u64 = 3;
    const EInvalidSecret: u64 = 4;
    const ETimelockNotExpired: u64 = 5;
    const EUnauthorizedAccess: u64 = 6;
    const EEscrowNotFound: u64 = 7;

    /// HTLC Escrow object
    struct HTLCEscrow<phantom T> has key, store {
        id: UID,
        sender: address,
        receiver: address,
        coin: Coin<T>,
        secret_hash: vector<u8>,
        timelock: u64,
        order_id: String,
        withdrawn: bool,
        cancelled: bool,
        created_at: u64,
    }

    /// Events
    struct EscrowCreated has copy, drop {
        escrow_id: ID,
        sender: address,
        receiver: address,
        amount: u64,
        order_id: String,
        timelock: u64,
    }

    struct EscrowWithdrawn has copy, drop {
        escrow_id: ID,
        receiver: address,
        amount: u64,
    }

    struct EscrowCancelled has copy, drop {
        escrow_id: ID,
        sender: address,
        amount: u64,
    }

    /// Create a new HTLC escrow
    public fun create_escrow<T>(
        coin: Coin<T>,
        receiver: address,
        secret_hash: vector<u8>,
        timelock: u64,
        order_id: String,
        clock: &Clock,
        ctx: &mut TxContext
    ): ID {
        let current_time = clock::timestamp_ms(clock);
        
        // Verify timelock is in the future
        assert!(timelock > current_time, EInvalidTimelock);

        let sender = context::sender(ctx);
        let escrow_id = object::new(ctx);
        let id = object::uid_to_inner(&escrow_id);

        let escrow = HTLCEscrow {
            id: escrow_id,
            sender,
            receiver,
            coin,
            secret_hash,
            timelock,
            order_id: order_id,
            withdrawn: false,
            cancelled: false,
            created_at: current_time,
        };

        // Emit creation event
        event::emit(EscrowCreated {
            escrow_id: id,
            sender,
            receiver,
            amount: coin::value(&escrow.coin),
            order_id,
            timelock,
        });

        // Transfer escrow object to shared storage
        transfer::share_object(escrow);
        id
    }

    /// Withdraw funds using the secret
    public fun withdraw<T>(
        escrow: &mut HTLCEscrow<T>,
        secret: vector<u8>,
        ctx: &mut TxContext
    ): Coin<T> {
        let sender = context::sender(ctx);
        
        // Verify receiver
        assert!(sender == escrow.receiver, EUnauthorizedAccess);
        
        // Verify not already processed
        assert!(!escrow.withdrawn, EAlreadyWithdrawn);
        assert!(!escrow.cancelled, EAlreadyCancelled);

        // Verify secret hash
        let provided_hash = hash::keccak256(&secret);
        assert!(provided_hash == escrow.secret_hash, EInvalidSecret);

        // Mark as withdrawn
        escrow.withdrawn = true;

        // Extract coin
        let amount = coin::value(&escrow.coin);
        let withdrawn_coin = coin::split(&mut escrow.coin, amount, ctx);

        // Emit withdrawal event
        event::emit(EscrowWithdrawn {
            escrow_id: object::uid_to_inner(&escrow.id),
            receiver: sender,
            amount,
        });

        withdrawn_coin
    }

    /// Cancel escrow after timelock expires
    public fun cancel<T>(
        escrow: &mut HTLCEscrow<T>,
        clock: &Clock,
        ctx: &mut TxContext
    ): Coin<T> {
        let sender = context::sender(ctx);
        let current_time = clock::timestamp_ms(clock);
        
        // Verify sender
        assert!(sender == escrow.sender, EUnauthorizedAccess);
        
        // Verify not already processed
        assert!(!escrow.withdrawn, EAlreadyWithdrawn);
        assert!(!escrow.cancelled, EAlreadyCancelled);

        // Verify timelock has expired
        assert!(current_time >= escrow.timelock, ETimelockNotExpired);

        // Mark as cancelled
        escrow.cancelled = true;

        // Extract coin
        let amount = coin::value(&escrow.coin);
        let refunded_coin = coin::split(&mut escrow.coin, amount, ctx);

        // Emit cancellation event
        event::emit(EscrowCancelled {
            escrow_id: object::uid_to_inner(&escrow.id),
            sender,
            amount,
        });

        refunded_coin
    }

    /// Get escrow details (read-only)
    public fun get_escrow_info<T>(escrow: &HTLCEscrow<T>): (
        address, // sender
        address, // receiver
        u64,     // amount
        vector<u8>, // secret_hash
        u64,     // timelock
        String,  // order_id
        bool,    // withdrawn
        bool,    // cancelled
        u64      // created_at
    ) {
        (
            escrow.sender,
            escrow.receiver,
            coin::value(&escrow.coin),
            escrow.secret_hash,
            escrow.timelock,
            escrow.order_id,
            escrow.withdrawn,
            escrow.cancelled,
            escrow.created_at
        )
    }

    /// Verify if a secret is correct for the escrow
    public fun verify_secret<T>(escrow: &HTLCEscrow<T>, secret: vector<u8>): bool {
        let provided_hash = hash::keccak256(&secret);
        provided_hash == escrow.secret_hash
    }

    /// Check if escrow can be cancelled
    public fun can_cancel<T>(escrow: &HTLCEscrow<T>, clock: &Clock): bool {
        let current_time = clock::timestamp_ms(clock);
        !escrow.withdrawn && !escrow.cancelled && current_time >= escrow.timelock
    }

    /// Check if escrow can be withdrawn (secret verification required separately)
    public fun can_withdraw<T>(escrow: &HTLCEscrow<T>): bool {
        !escrow.withdrawn && !escrow.cancelled
    }

    /// Get escrow ID
    public fun get_id<T>(escrow: &HTLCEscrow<T>): ID {
        object::uid_to_inner(&escrow.id)
    }

    #[test_only]
    public fun test_create_escrow<T>(
        coin: Coin<T>,
        receiver: address,
        secret_hash: vector<u8>,
        timelock: u64,
        order_id: String,
        ctx: &mut TxContext
    ): HTLCEscrow<T> {
        let sender = context::sender(ctx);
        HTLCEscrow {
            id: object::new(ctx),
            sender,
            receiver,
            coin,
            secret_hash,
            timelock,
            order_id,
            withdrawn: false,
            cancelled: false,
            created_at: 1000, // Fixed timestamp for tests
        }
    }
}