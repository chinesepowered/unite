// Sui Move HTLC Escrow Module
// Implements atomic cross-chain swaps with hashlock and timelock

module htlc_escrow::escrow {
    use sui::object;
    use sui::tx_context;
    use sui::coin;
    use sui::clock;
    use sui::hash;
    use sui::event;
    use sui::transfer;
    use std::string::{String};
    use std::vector;

    /// Error codes
    const EInvalidTimelock: u64 = 1;
    const EAlreadyWithdrawn: u64 = 2;
    const EAlreadyCancelled: u64 = 3;
    const EInvalidSecret: u64 = 4;
    const ETimelockNotExpired: u64 = 5;
    const EUnauthorizedAccess: u64 = 6;
    const EZeroAmount: u64 = 9;

    /// HTLC Escrow object
    public struct HTLCEscrow<phantom T> has key {
        id: object::UID,
        sender: address,
        receiver: address,
        coin: coin::Coin<T>,
        secret_hash: vector<u8>,
        timelock: u64,
        order_id: String,
        withdrawn: bool,
        cancelled: bool,
        created_at: u64,
    }

    /// Events
    public struct EscrowCreated has copy, drop {
        escrow_id: object::ID,
        sender: address,
        receiver: address,
        amount: u64,
        order_id: String,
        timelock: u64,
        created_at: u64,
    }

    public struct EscrowWithdrawn has copy, drop {
        escrow_id: object::ID,
        receiver: address,
        amount: u64,
        secret: vector<u8>,
        withdrawn_at: u64,
    }

    public struct EscrowCancelled has copy, drop {
        escrow_id: object::ID,
        sender: address,
        amount: u64,
        cancelled_at: u64,
    }

    /// Create a new HTLC escrow
    public fun create_escrow<T>(
        coin_input: coin::Coin<T>,
        receiver: address,
        secret_hash: vector<u8>,
        timelock: u64,
        order_id: String,
        clock_obj: &clock::Clock,
        ctx: &mut tx_context::TxContext
    ): object::ID {
        let current_time = clock::timestamp_ms(clock_obj);
        let amount = coin::value(&coin_input);
        
        // Verify amount is not zero
        assert!(amount > 0, EZeroAmount);
        
        // Verify timelock is in the future (at least 1 minute from now)
        assert!(timelock > current_time + 60000, EInvalidTimelock);
        
        // Verify secret hash is not empty
        assert!(vector::length(&secret_hash) > 0, EInvalidSecret);

        let sender = tx_context::sender(ctx);
        let escrow_id = object::new(ctx);
        let id = object::uid_to_inner(&escrow_id);

        let escrow = HTLCEscrow {
            id: escrow_id,
            sender,
            receiver,
            coin: coin_input,
            secret_hash,
            timelock,
            order_id,
            withdrawn: false,
            cancelled: false,
            created_at: current_time,
        };

        // Emit creation event
        event::emit(EscrowCreated {
            escrow_id: id,
            sender,
            receiver,
            amount,
            order_id,
            timelock,
            created_at: current_time,
        });

        // Transfer escrow object to shared storage
        transfer::share_object(escrow);
        id
    }

    /// Withdraw funds using the secret
    public fun withdraw<T>(
        escrow: &mut HTLCEscrow<T>,
        secret: vector<u8>,
        clock_obj: &clock::Clock,
        ctx: &mut tx_context::TxContext
    ): coin::Coin<T> {
        let sender = tx_context::sender(ctx);
        let current_time = clock::timestamp_ms(clock_obj);
        
        // Verify receiver
        assert!(sender == escrow.receiver, EUnauthorizedAccess);
        
        // Verify not already processed
        assert!(!escrow.withdrawn, EAlreadyWithdrawn);
        assert!(!escrow.cancelled, EAlreadyCancelled);
        
        // Verify timelock hasn't expired yet
        assert!(current_time < escrow.timelock, ETimelockNotExpired);

        // Verify secret hash
        let provided_hash = hash::keccak256(&secret);
        assert!(provided_hash == escrow.secret_hash, EInvalidSecret);

        // Mark as withdrawn
        escrow.withdrawn = true;

        // Extract all coins
        let amount = coin::value(&escrow.coin);
        let withdrawn_coin = coin::split(&mut escrow.coin, amount, ctx);

        // Emit withdrawal event
        event::emit(EscrowWithdrawn {
            escrow_id: object::uid_to_inner(&escrow.id),
            receiver: sender,
            amount,
            secret,
            withdrawn_at: current_time,
        });

        withdrawn_coin
    }

    /// Cancel escrow after timelock expires
    public fun cancel<T>(
        escrow: &mut HTLCEscrow<T>,
        clock_obj: &clock::Clock,
        ctx: &mut tx_context::TxContext
    ): coin::Coin<T> {
        let sender = tx_context::sender(ctx);
        let current_time = clock::timestamp_ms(clock_obj);
        
        // Verify sender
        assert!(sender == escrow.sender, EUnauthorizedAccess);
        
        // Verify not already processed
        assert!(!escrow.withdrawn, EAlreadyWithdrawn);
        assert!(!escrow.cancelled, EAlreadyCancelled);

        // Verify timelock has expired
        assert!(current_time >= escrow.timelock, ETimelockNotExpired);

        // Mark as cancelled
        escrow.cancelled = true;

        // Extract all coins
        let amount = coin::value(&escrow.coin);
        let refunded_coin = coin::split(&mut escrow.coin, amount, ctx);

        // Emit cancellation event
        event::emit(EscrowCancelled {
            escrow_id: object::uid_to_inner(&escrow.id),
            sender,
            amount,
            cancelled_at: current_time,
        });

        refunded_coin
    }

    /// Get escrow details (read-only)
    public fun get_escrow_info<T>(escrow: &HTLCEscrow<T>): (
        address,    // sender
        address,    // receiver
        u64,        // amount
        vector<u8>, // secret_hash
        u64,        // timelock
        String,     // order_id
        bool,       // withdrawn
        bool,       // cancelled
        u64         // created_at
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
    public fun can_cancel<T>(escrow: &HTLCEscrow<T>, clock_obj: &clock::Clock): bool {
        let current_time = clock::timestamp_ms(clock_obj);
        !escrow.withdrawn && !escrow.cancelled && current_time >= escrow.timelock
    }

    /// Check if escrow can be withdrawn (secret verification required separately)
    public fun can_withdraw<T>(escrow: &HTLCEscrow<T>, clock_obj: &clock::Clock): bool {
        let current_time = clock::timestamp_ms(clock_obj);
        !escrow.withdrawn && !escrow.cancelled && current_time < escrow.timelock
    }

    /// Get escrow ID
    public fun get_id<T>(escrow: &HTLCEscrow<T>): object::ID {
        object::uid_to_inner(&escrow.id)
    }

    /// Get escrow sender
    public fun get_sender<T>(escrow: &HTLCEscrow<T>): address {
        escrow.sender
    }

    /// Get escrow receiver
    public fun get_receiver<T>(escrow: &HTLCEscrow<T>): address {
        escrow.receiver
    }

    /// Get escrow amount
    public fun get_amount<T>(escrow: &HTLCEscrow<T>): u64 {
        coin::value(&escrow.coin)
    }

    /// Get escrow timelock
    public fun get_timelock<T>(escrow: &HTLCEscrow<T>): u64 {
        escrow.timelock
    }

    /// Get escrow order ID
    public fun get_order_id<T>(escrow: &HTLCEscrow<T>): String {
        escrow.order_id
    }

    /// Check if escrow is withdrawn
    public fun is_withdrawn<T>(escrow: &HTLCEscrow<T>): bool {
        escrow.withdrawn
    }

    /// Check if escrow is cancelled
    public fun is_cancelled<T>(escrow: &HTLCEscrow<T>): bool {
        escrow.cancelled
    }

    /// Get creation timestamp
    public fun get_created_at<T>(escrow: &HTLCEscrow<T>): u64 {
        escrow.created_at
    }

    /// Calculate remaining time until timelock expires
    public fun get_remaining_time<T>(escrow: &HTLCEscrow<T>, clock_obj: &clock::Clock): u64 {
        let current_time = clock::timestamp_ms(clock_obj);
        if (current_time >= escrow.timelock) {
            0
        } else {
            escrow.timelock - current_time
        }
    }

    #[test_only]
    use sui::test_scenario;
    #[test_only]
    use sui::coin::{mint_for_testing};

    #[test_only]
    public fun test_create_escrow<T>(
        coin_input: coin::Coin<T>,
        receiver: address,
        secret_hash: vector<u8>,
        timelock: u64,
        order_id: String,
        ctx: &mut tx_context::TxContext
    ): HTLCEscrow<T> {
        let sender = tx_context::sender(ctx);
        HTLCEscrow {
            id: object::new(ctx),
            sender,
            receiver,
            coin: coin_input,
            secret_hash,
            timelock,
            order_id,
            withdrawn: false,
            cancelled: false,
            created_at: 1000, // Fixed timestamp for tests
        }
    }

    #[test]
    fun test_escrow_creation() {
        use sui::test_scenario;
        use sui::clock;
        use sui::coin;
        use std::string;

        let sender = @0xA;
        let receiver = @0xB;
        
        let scenario_val = test_scenario::begin(sender);
        let scenario = &mut scenario_val;
        
        // Create clock
        let clock_obj = clock::create_for_testing(test_scenario::ctx(scenario));
        clock::set_for_testing(&mut clock_obj, 1000);
        
        // Create test coin
        let coin_input = coin::mint_for_testing<sui::sui::SUI>(1000, test_scenario::ctx(scenario));
        
        // Create secret and hash
        let secret = b"test_secret_123";
        let secret_hash = hash::keccak256(&secret);
        
        // Create escrow
        let order_id = string::utf8(b"order_123");
        let timelock = 62000; // 61 seconds in the future
        
        let escrow_id = create_escrow(
            coin_input,
            receiver,
            secret_hash,
            timelock,
            order_id,
            &clock_obj,
            test_scenario::ctx(scenario)
        );
        
        // Verify escrow was created
        assert!(object::id_to_address(&escrow_id) != @0x0, 0);
        
        clock::destroy_for_testing(clock_obj);
        test_scenario::end(scenario_val);
    }
}