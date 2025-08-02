# Working 4-Transaction Atomic Swap Test Flow

## ✅ Confirmed Working: Monad → Base Atomic Swap

Based on successful test execution, here's the exact working flow:

### Step 1: Create Swap Order
```bash
POST /api/swap
Content-Type: application/json

{
  "srcChain": "monad",
  "dstChain": "base",
  "srcAmount": "1000000000000000",
  "dstAmount": "1000000000000000",
  "srcToken": "MON",
  "dstToken": "ETH"
}
```

**Response:**
- Status: `200 OK` in ~8ms
- Returns `orderId` (e.g., `0xdd879abf27bc0038b0f15b6a9510b5f9`)

**Internal Processing:**
```
📝 Stored swap 0xdd879abf27bc0038b0f15b6a9510b5f9: 1000000000000000 monad → 1000000000000000 base
📝 Stored swap data for status endpoint: 0xdd879abf27bc0038b0f15b6a9510b5f9
POST /api/swap 200 in 8ms
```

### Step 2: Execute 4-Transaction Atomic Swap
```bash
POST /api/execute-swap?orderId={orderId}
Content-Type: application/json
```

**Response:**
- Status: `200 OK` in ~17s (real blockchain transactions)
- Returns complete swap execution details

## 🎯 What Happens During Execution

The logs show the complete 4-transaction flow:

### Transaction 1: Alice Creates Monad Escrow
```
🎯 Step 1: Alice creating escrow on monad
🔑 Monad adapter using first wallet: 0x6Bd07000C5F746af69BEe7f151eb30285a6678B2
🎯 Creating REAL Monad HTLC using deployed contract
💰 Monad HTLC: 0.001 MON for order 0xdd879abf27bc0038b0f15b6a9510b5f9
✅ HTLC contract exists, calling createHTLCEscrowMON...
🎯 Alice creating escrow for Bob
✅ Monad HTLC contract called successfully
🔍 Real escrow ID: 0xafc33c535aec04eb208dd217afb5e3d055a01f842716f748a67eca33032259a7
✅ Alice's monad escrow created: 0x65490e594edcdeb257c9aa7de399aeb389634664b9403d262d926b4139147832
```

### Transaction 2: Bob Creates Base Escrow
```
🎯 Step 2: Bob creating escrow on base
🔑 Base adapter using second wallet: 0xe3B24b93C18eD1B7eEa9e07b3B03D03259f3942e
🎯 Creating REAL 1inch LOP v4 order on Base Sepolia
💰 Base LOP: 0.001 ETH → 1000000000000000 base
✅ Contract connected! Domain separator: 0x7521ad7afc384cfaf350d39e66992fc09fca236aa2ee43ac935e65e63b9ecfb5
✅ 1inch LOP order hash: 0xb963559a01567e3df011f856c62a790d475b8fb0a7442240305c5dfc93fa6f0b
✅ SUCCESS: 1inch LOP order + HTLC escrow created!
✅ Bob's base escrow created: 0xdf351f6657e6a4019d787bfdf9c66cf61a35deabc8aed07a59802ed470d0dbb3
```

### Transaction 3: Alice Claims Base Funds (Reveals Secret)
```
🎯 Step 3a: Alice claiming Bob's base funds
🔑 Base adapter using first wallet: 0x6Bd07000C5F746af69BEe7f151eb30285a6678B2
🔗 Using real escrow ID: lop_b963559a
🎯 Claiming Base HTLC escrow with secret
✅ Base HTLC claimed: 0x3ec749c30041d457a61f7cb91f51c1ce0524ff21b469083e2cd20cca44dc48cf
✅ Alice claimed base funds
```

### Transaction 4: Bob Claims Monad Funds (Using Revealed Secret)
```
🎯 Step 3b: Bob claiming Alice's monad funds
🔑 Monad adapter using second wallet: 0xe3B24b93C18eD1B7eEa9e07b3B03D03259f3942e
🔗 Using real escrow ID: 0xafc33c535aec04eb208dd217afb5e3d055a01f842716f748a67eca33032259a7
📋 Escrow details: {
  sender: '0x6Bd07000C5F746af69BEe7f151eb30285a6678B2',
  receiver: '0xe3B24b93C18eD1B7eEa9e07b3B03D03259f3942e',
  amount: '0.001',
  withdrawn: false,
  cancelled: false
}
🔍 Secret valid: true
✅ Monad HTLC claimed successfully: 0x2ca9ed14226ff2c8741306f2f19c1db7bdf9f4a988310065841889582e86ec8b
✅ Bob claimed monad funds
```

### Final Result
```
🎉 Swap 0xdd879abf27bc0038b0f15b6a9510b5f9 completed successfully!
📊 Final result: { success: true, resultsCount: 4, errorsCount: 0 }
```

## 🔄 Supported Chain Pairs

### Currently Working:
- ✅ **Monad → Base** (0.001 MON → 0.001 ETH)
- ✅ **Base → Monad** (0.001 ETH → 0.001 MON)

### Same Flow for Other Chains:
Replace `"srcChain"` and `"dstChain"` with:
- `"base"` (Base Sepolia testnet)
- `"monad"` (Monad testnet)  
- `"sui"` (Sui testnet)
- `"stellar"` (Stellar testnet)

## 📋 Test Parameters

### Standard Test Amount
```json
{
  "srcAmount": "1000000000000000",
  "dstAmount": "1000000000000000"
}
```
*Note: This is 0.001 in 18-decimal format (1000000000000000 wei = 0.001 ETH/MON)*

### Wallet Configuration
- **Alice (First Wallet)**: `0x6Bd07000C5F746af69BEe7f151eb30285a6678B2`
- **Bob (Second Wallet)**: `0xe3B24b93C18eD1B7eEa9e07b3B03D03259f3942e`

### Contract Addresses
- **Monad HTLC**: `0x0A027767aC1e4aA5474A1B98C3eF730C3994E67b`
- **Base 1inch LOP**: `0xE53136D9De56672e8D2665C98653AC7b8A60Dc44`

## ⚡ Performance Metrics

- **Swap Creation**: ~8ms
- **4-Transaction Execution**: ~17 seconds
- **Success Rate**: 100% (4/4 transactions)
- **Total Gas Used**: Real blockchain gas on both networks

## 🧪 Test Execution Examples

### Test Monad → Base Swap
```bash
# Step 1: Create swap
curl -X POST http://localhost:3000/api/swap \
  -H "Content-Type: application/json" \
  -d '{
    "srcChain": "monad",
    "dstChain": "base",
    "srcAmount": "1000000000000000",
    "dstAmount": "1000000000000000",
    "srcToken": "MON",
    "dstToken": "ETH"
  }'

# Step 2: Execute (use orderId from step 1 response)
curl -X POST 'http://localhost:3000/api/execute-swap?orderId=0xYOUR_ORDER_ID'
```

### Test Base → Monad Swap
```bash
# Step 1: Create swap
curl -X POST http://localhost:3000/api/swap \
  -H "Content-Type: application/json" \
  -d '{
    "srcChain": "base",
    "dstChain": "monad",
    "srcAmount": "1000000000000000",
    "dstAmount": "1000000000000000",
    "srcToken": "ETH",
    "dstToken": "MON"
  }'

# Step 2: Execute
curl -X POST 'http://localhost:3000/api/execute-swap?orderId=0xYOUR_ORDER_ID'
```

## 🎉 Success Indicators

Look for these in the logs:
- ✅ `Alice's [chain] escrow created`
- ✅ `Bob's [chain] escrow created` 
- ✅ `Alice claimed [chain] funds`
- ✅ `Bob claimed [chain] funds`
- 🎉 `Swap [orderId] completed successfully!`
- 📊 `Final result: { success: true, resultsCount: 4, errorsCount: 0 }`

The atomic swap is only considered successful when all 4 transactions complete and both parties have claimed their funds.