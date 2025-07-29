// Sui Move HTLC Escrow Module
// Implements atomic cross-chain swaps with hashlock and timelock

module htlc_escrow::escrow {
    use sui::object::{Self, UID, ID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
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
    const EInsufficientFunds: u64 = 8;
    const EZeroAmount: u64 = 9;

    /// HTLC Escrow object
    struct HTLCEscrow<phantom T> has key {
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
        created_at: u64,
    }

    struct EscrowWithdrawn has copy, drop {
        escrow_id: ID,
        receiver: address,
        amount: u64,
        secret: vector<u8>,
        withdrawn_at: u64,
    }

    struct EscrowCancelled has copy, drop {
        escrow_id: ID,
        sender: address,
        amount: u64,
        cancelled_at: u64,
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
        let amount = coin::value(&coin);
        
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
            coin,
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
        clock: &Clock,
        ctx: &mut TxContext
    ): Coin<T> {
        let sender = tx_context::sender(ctx);
        let current_time = clock::timestamp_ms(clock);
        
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
        clock: &Clock,
        ctx: &mut TxContext
    ): Coin<T> {
        let sender = tx_context::sender(ctx);
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
    public fun can_cancel<T>(escrow: &HTLCEscrow<T>, clock: &Clock): bool {
        let current_time = clock::timestamp_ms(clock);
        !escrow.withdrawn && !escrow.cancelled && current_time >= escrow.timelock
    }

    /// Check if escrow can be withdrawn (secret verification required separately)
    public fun can_withdraw<T>(escrow: &HTLCEscrow<T>, clock: &Clock): bool {
        let current_time = clock::timestamp_ms(clock);
        !escrow.withdrawn && !escrow.cancelled && current_time < escrow.timelock
    }

    /// Get escrow ID
    public fun get_id<T>(escrow: &HTLCEscrow<T>): ID {
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
    public fun get_remaining_time<T>(escrow: &HTLCEscrow<T>, clock: &Clock): u64 {
        let current_time = clock::timestamp_ms(clock);
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
        coin: Coin<T>,
        receiver: address,
        secret_hash: vector<u8>,
        timelock: u64,
        order_id: String,
        ctx: &mut TxContext
    ): HTLCEscrow<T> {
        let sender = tx_context::sender(ctx);
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
        let clock = clock::create_for_testing(test_scenario::ctx(scenario));
        clock::set_for_testing(&mut clock, 1000);
        
        // Create test coin
        let coin = coin::mint_for_testing<sui::sui::SUI>(1000, test_scenario::ctx(scenario));
        
        // Create secret and hash
        let secret = b"test_secret_123";
        let secret_hash = hash::keccak256(&secret);
        
        // Create escrow
        let order_id = string::utf8(b"order_123");
        let timelock = 2000; // 1 second in the future
        
        let escrow_id = create_escrow(
            coin,
            receiver,
            secret_hash,
            timelock,
            order_id,
            &clock,
            test_scenario::ctx(scenario)
        );
        
        // Verify escrow was created
        assert!(object::id_to_address(&escrow_id) != @0x0, 0);
        
        clock::destroy_for_testing(clock);
        test_scenario::end(scenario_val);
    }

    #[test]
    fun test_withdraw_with_correct_secret() {
        use sui::test_scenario;
        use sui::clock;
        use sui::coin;
        use std::string;

        let sender = @0xA;
        let receiver = @0xB;
        
        let scenario_val = test_scenario::begin(sender);
        let scenario = &mut scenario_val;
        
        // Create clock
        let clock = clock::create_for_testing(test_scenario::ctx(scenario));
        clock::set_for_testing(&mut clock, 1000);
        
        // Create test coin
        let coin = coin::mint_for_testing<sui::sui::SUI>(1000, test_scenario::ctx(scenario));
        
        // Create secret and hash
        let secret = b"test_secret_123";
        let secret_hash = hash::keccak256(&secret);
        
        // Create escrow
        let order_id = string::utf8(b"order_123");
        let timelock = 5000; // 4 seconds in the future
        
        create_escrow(
            coin,
            receiver,
            secret_hash,
            timelock,
            order_id,
            &clock,
            test_scenario::ctx(scenario)
        );
        
        test_scenario::next_tx(scenario, receiver);
        
        // Get the shared escrow object
        let escrow = test_scenario::take_shared<HTLCEscrow<sui::sui::SUI>>(scenario);
        
        // Try to withdraw with correct secret
        let withdrawn_coin = withdraw(&mut escrow, secret, &clock, test_scenario::ctx(scenario));
        
        // Verify withdrawal
        assert!(coin::value(&withdrawn_coin) == 1000, 0);
        assert!(is_withdrawn(&escrow), 1);
        
        coin::burn_for_testing(withdrawn_coin);
        test_scenario::return_shared(escrow);
        clock::destroy_for_testing(clock);
        test_scenario::end(scenario_val);
    }

    #[test]
    #[expected_failure(abort_code = EInvalidSecret)]
    fun test_withdraw_with_wrong_secret() {
        use sui::test_scenario;
        use sui::clock;
        use sui::coin;
        use std::string;

        let sender = @0xA;
        let receiver = @0xB;
        
        let scenario_val = test_scenario::begin(sender);
        let scenario = &mut scenario_val;
        
        // Create clock
        let clock = clock::create_for_testing(test_scenario::ctx(scenario));
        clock::set_for_testing(&mut clock, 1000);
        
        // Create test coin
        let coin = coin::mint_for_testing<sui::sui::SUI>(1000, test_scenario::ctx(scenario));
        
        // Create secret and hash
        let secret = b"test_secret_123";
        let secret_hash = hash::keccak256(&secret);
        
        // Create escrow
        let order_id = string::utf8(b"order_123");
        let timelock = 5000;
        
        create_escrow(
            coin,
            receiver,
            secret_hash,
            timelock,
            order_id,
            &clock,
            test_scenario::ctx(scenario)
        );
        
        test_scenario::next_tx(scenario, receiver);
        
        // Get the shared escrow object
        let escrow = test_scenario::take_shared<HTLCEscrow<sui::sui::SUI>>(scenario);
        
        // Try to withdraw with wrong secret - should fail
        let wrong_secret = b"wrong_secret";
        let withdrawn_coin = withdraw(&mut escrow, wrong_secret, &clock, test_scenario::ctx(scenario));
        
        coin::burn_for_testing(withdrawn_coin);
        test_scenario::return_shared(escrow);
        clock::destroy_for_testing(clock);
        test_scenario::end(scenario_val);
    }

    #[test]
    fun test_cancel_after_timelock() {
        use sui::test_scenario;
        use sui::clock;
        use sui::coin;
        use std::string;

        let sender = @0xA;
        let receiver = @0xB;
        
        let scenario_val = test_scenario::begin(sender);
        let scenario = &mut scenario_val;
        
        // Create clock
        let clock = clock::create_for_testing(test_scenario::ctx(scenario));
        clock::set_for_testing(&mut clock, 1000);
        
        // Create test coin
        let coin = coin::mint_for_testing<sui::sui::SUI>(1000, test_scenario::ctx(scenario));
        
        // Create secret and hash
        let secret = b"test_secret_123";
        let secret_hash = hash::keccak256(&secret);
        
        // Create escrow
        let order_id = string::utf8(b"order_123");
        let timelock = 2000;
        
        create_escrow(
            coin,
            receiver,
            secret_hash,
            timelock,
            order_id,
            &clock,
            test_scenario::ctx(scenario)
        );
        
        // Advance time past timelock
        clock::set_for_testing(&mut clock, 3000);
        
        test_scenario::next_tx(scenario, sender);
        
        // Get the shared escrow object
        let escrow = test_scenario::take_shared<HTLCEscrow<sui::sui::SUI>>(scenario);
        
        // Cancel the escrow
        let refunded_coin = cancel(&mut escrow, &clock, test_scenario::ctx(scenario));
        
        // Verify cancellation
        assert!(coin::value(&refunded_coin) == 1000, 0);
        assert!(is_cancelled(&escrow), 1);
        
        coin::burn_for_testing(refunded_coin);
        test_scenario::return_shared(escrow);
        clock::destroy_for_testing(clock);
        test_scenario::end(scenario_val);
    }
}