# 🔧 **United Technical Documentation**

## 🏗️ **System Architecture Overview**

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend       │    │  Blockchain     │
│   (React)       │    │   (Next.js)     │    │  Contracts      │
├─────────────────┤    ├─────────────────┤    ├─────────────────┤
│ • Swap UI       │◄──►│ • API Routes    │◄──►│ • HTLC Escrows  │
│ • Demo Page     │    │ • Chain Adapters│    │ • 1inch LOP     │
│ • Tx Tracking   │    │ • Secret Mgmt   │    │ • Move Contracts│
│ • Status Display│    │ • Orchestration │    │ • Soroban Code  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

---

## 🔐 **Smart Contract Architecture**

### **🔵 Base Sepolia (Source Chain)**
```solidity
// 1inch Limit Order Protocol Integration
contract LimitOrderProtocol {
    function fillOrder(
        Order calldata order,
        bytes calldata signature,
        uint256 amount
    ) external;
}

// HTLC Contract for Atomic Security
contract HTLCEscrow {
    function createHTLCEscrowMON(
        bytes32 secretHash,
        uint256 timelock, 
        address receiver,
        string memory orderId
    ) external payable returns (bytes32 escrowId);
    
    function withdraw(
        bytes32 escrowId,
        string memory secret
    ) external;
}
```

**Contract Address**: `0xF7BDB4eCb444f88b290Bb28574b5b702550AB179`

### **⚡ Monad Testnet (Destination Chain)**
```solidity
contract HTLCEscrow {
    struct Escrow {
        address payable sender;
        address payable receiver;
        uint256 amount;
        bytes32 secretHash;        // keccak256(abi.encodePacked(secret))
        uint256 timelock;
        bool withdrawn;
        bool cancelled;
        string orderId;
    }
    
    function createHTLCEscrowMON(
        bytes32 secretHash,
        uint256 timelock,
        address receiver, 
        string memory orderId
    ) external payable returns (bytes32);
    
    function withdraw(
        bytes32 escrowId,
        string memory secret      // Plain string, hashed inside contract
    ) external;
    
    function verifySecret(
        bytes32 escrowId, 
        string memory secret
    ) external view returns (bool);
}
```

**Contract Address**: `0x0A027767aC1e4aA5474A1B98C3eF730C3994E67b`

### **🌊 Sui Testnet (Move Contract)**
```move
module htlc_escrow::escrow {
    struct HTLCEscrow<phantom T> has key, store {
        id: UID,
        sender: address,
        receiver: address,
        coin: Coin<T>,
        secret_hash: vector<u8>,    // Raw bytes hash
        timelock: u64,
        withdrawn: bool,
        cancelled: bool,
    }
    
    public fun create_escrow<T>(
        coin: Coin<T>,
        secret_hash: vector<u8>,   // Expects raw byte hash
        timelock: u64,
        receiver: address,
        ctx: &mut TxContext
    ): HTLCEscrow<T>;
    
    public fun withdraw<T>(
        escrow: &mut HTLCEscrow<T>,
        secret: vector<u8>,        // Raw bytes, hashed inside function
        clock_obj: &Clock,
        ctx: &mut TxContext
    ): Coin<T>;
}
```

**Package ID**: `0x04cf15bd22b901053411485b652914f92a2cb1c337e10e5a45a839e1c7ac3f8e`

---

## 🔑 **Critical Innovation: Cross-VM Secret Hashing**

### **The Challenge**
Different blockchain VMs handle secret hashing differently:

```typescript
// ❌ WRONG: One-size-fits-all approach
const secretHash = ethers.keccak256('0x' + secret); // Only works for Sui

// ✅ CORRECT: Chain-specific hashing
if (srcChain === 'sui' || dstChain === 'sui') {
    // Sui Move: hash::keccak256(&secret) expects raw bytes
    secretHash = ethers.keccak256('0x' + secret);
} else {
    // EVM: keccak256(abi.encodePacked(secret)) expects string
    secretHash = ethers.keccak256(ethers.toUtf8Bytes(secret));
}
```

### **Why This Matters**
- **Sui Move**: `hash::keccak256(&vector<u8>)` → Hash raw bytes
- **EVM Solidity**: `keccak256(abi.encodePacked(string))` → Hash UTF-8 string
- **Result**: Different hashes for same secret → Failed atomic swaps

---

## 🔄 **Detailed Swap Flow: Monad → Base**

### **Step 1: Alice Creates Base Escrow**
```typescript
// 1. Create 1inch Limit Order
const order = {
    maker: '0xe3B24b93C18eD1B7eEa9e07b3B03D03259f3942e',
    makerAsset: 'ETH',
    takerAsset: 'MON', 
    makingAmount: '1000000000000000', // 0.001 ETH
    takingAmount: '1000000000000000', // 0.001 MON
    secretHash: ethers.keccak256(ethers.toUtf8Bytes(secret))
};

// 2. Sign order for 1inch LOP compliance
const signature = await wallet.signTypedData(domain, types, order);

// 3. Create HTLC escrow for security
const tx = await htlcContract.createHTLCEscrowMON(
    order.secretHash,
    timelock,
    receiverAddress,
    orderId,
    { value: amount }
);
```

**Real Transaction**: `0x276d5812b168d906b65219f0dd740c822a1faa83f85607692d6e6595e04344ba`

### **Step 2: Bob Creates Monad Escrow**
```typescript
// Bob sees Alice's escrow and creates matching escrow on Monad
const bobTx = await monadContract.createHTLCEscrowMON(
    order.secretHash,  // Same hash as Alice
    timelock,
    aliceAddress,      // Alice will claim this
    orderId,
    { value: amount }
);
```

**Real Transaction**: `0xb6941c27ce4873e8c9969bb8c03169c83fbfd189846856fbfed55ef2b114c52e`

### **Step 3: Alice Claims Monad Funds (Reveals Secret)**
```typescript
// Alice withdraws Bob's MON by revealing the secret
const claimTx = await monadContract.withdraw(
    bobEscrowId,
    secret  // This reveals the secret on-chain!
);

// Contract verifies: keccak256(abi.encodePacked(secret)) == secretHash
```

**Real Transaction**: `0xc48a7e0e597bb2a728eb2ee9971f188483d2261b37ac7793e9a36503d4835525`

### **Step 4: Bob Claims Base Funds (Uses Revealed Secret)**
```typescript
// Bob extracts the secret from Alice's transaction and claims ETH
const secret = extractSecretFromTransaction(aliceClaimTx);
const bobClaimTx = await baseContract.withdraw(
    aliceEscrowId,
    secret  // Same secret Alice revealed
);
```

**Real Transaction**: `0x77dfd49e1f451553f0aaa8d9696308091641a39e08d0b806a6d2737667134897`

**🎉 Result**: Both parties have successfully swapped funds atomically!

---

## 🌊 **Detailed Swap Flow: Sui → Base**

### **Step 1: Alice Creates Base Escrow (Same as above)**

### **Step 2: Bob Creates Sui Escrow**
```typescript
// Sui uses Transaction Blocks for complex operations
const tx = new Transaction();

// Create coin from gas for the escrow
const [coin] = tx.splitCoins(tx.gas, [amount]);

// Create the HTLC escrow object
tx.moveCall({
    target: `${packageId}::escrow::create_escrow`,
    arguments: [
        coin,
        tx.pure.vector('u8', Array.from(secretHashBytes)), // ✅ Fixed BCS encoding
        tx.pure.u64(timelock),
        tx.pure.address(receiverAddress),
    ],
    typeArguments: ['0x2::sui::SUI'],
});

const result = await suiClient.signAndExecuteTransaction({
    signer: bobKeypair,
    transaction: tx,
});
```

### **Step 3: Alice Claims Sui Funds**
```typescript
// Alice claims the Sui escrow
const claimTx = new Transaction();

claimTx.moveCall({
    target: `${packageId}::escrow::withdraw`,
    arguments: [
        claimTx.object(escrowObjectId),
        claimTx.pure.vector('u8', Array.from(secretBytes)), // Raw secret bytes
        claimTx.object('0x6'), // Sui Clock object
    ],
    typeArguments: ['0x2::sui::SUI'],
});

// Move contract verifies: keccak256(&secret) == secret_hash
```

### **Step 4: Bob Claims Base Funds (Same as Monad flow)**

---

## 💻 **Frontend Architecture**

### **React Component Structure**
```
app/
├── components/
│   ├── SwapForm.tsx          # Main swap interface
│   ├── SwapStatus.tsx        # Transaction tracking
│   ├── SwapHistory.tsx       # Historical swaps
│   └── NetworkStatus.tsx     # Chain status display
├── demo/
│   └── page.tsx              # Demo interface with preset swaps
├── api/
│   ├── swap/route.ts         # Create swap orders
│   ├── execute-swap/route.ts # Execute atomic swaps
│   └── wallet-status/route.ts # Check balances
└── lib/
    ├── chain-adapters.ts     # Core chain integration logic
    ├── api.ts               # Frontend API client
    └── types.ts             # TypeScript definitions
```

### **Chain Adapter Pattern**
```typescript
abstract class ChainAdapter {
    abstract createHTLC(order: SwapOrder): Promise<TransactionResult>;
    abstract claimHTLC(escrowId: string, secret: string): Promise<TransactionResult>;
    abstract getBalance(): Promise<string>;
}

class BaseAdapter extends ChainAdapter {
    // 1inch LOP + HTLC implementation
}

class MonadAdapter extends ChainAdapter {
    // Pure HTLC EVM implementation  
}

class SuiAdapter extends ChainAdapter {
    // Move-based HTLC implementation
}
```

---

## 🔀 **API Flow Architecture**

### **1. Create Swap (`/api/swap`)**
```typescript
POST /api/swap
{
    "srcChain": "monad",
    "dstChain": "base", 
    "srcAmount": "1000000000000000",
    "dstAmount": "1000000000000000"
}

// Generates:
// - orderId: 0x6d9edf3951488e491886ed8f9d03a709
// - secret: fb559baf56fcfbd6461da306952df303dec208e3fae3c3742b4d61eccc42be36
// - secretHash: 0x8dcb5907588d1091f4fb399377e3927709a916ce424a75ac32155225e126121a
```

### **2. Execute Swap (`/api/execute-swap`)**
```typescript
POST /api/execute-swap?orderId=0x6d9edf3951488e491886ed8f9d03a709

// Orchestrates 4-step atomic process:
const results = await Promise.all([
    aliceAdapter.createHTLC(swapOrder),    // Alice locks source funds
    bobAdapter.createHTLC(swapOrder),      // Bob locks destination funds  
    aliceAdapter.claimHTLC(bobEscrowId, secret),   // Alice claims (reveals secret)
    bobAdapter.claimHTLC(aliceEscrowId, secret),   // Bob claims (uses secret)
]);
```

---

## 🛡️ **Security Mechanisms**

### **1. Hashlock Protection**
```solidity
// Monad/Base Contract
bytes32 providedSecretHash = keccak256(abi.encodePacked(secret));
if (providedSecretHash != escrow.secretHash) revert InvalidSecret();
```

```move
// Sui Contract  
let provided_hash = hash::keccak256(&secret);
assert!(provided_hash == escrow.secret_hash, EInvalidSecret);
```

### **2. Timelock Protection**
```solidity
// Automatic refunds prevent fund loss
if (block.timestamp >= escrow.timelock) {
    // Allow cancellation by sender
    escrow.cancelled = true;
    payable(escrow.sender).transfer(escrow.amount);
}
```

### **3. Access Control**
```solidity
modifier onlyReceiver(bytes32 escrowId) {
    require(msg.sender == escrows[escrowId].receiver, "Unauthorized");
    _;
}
```

### **4. Reentrancy Protection**
```solidity
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract HTLCEscrow is ReentrancyGuard {
    function withdraw(...) external nonReentrant {
        // Safe state updates before external calls
    }
}
```

---

## 🧪 **Testing & Verification**

### **Live Testnet Results**
```json
{
    "success": true,
    "message": "🎉 Atomic swap completed! Both parties claimed funds (4 transactions)",
    "results": [
        {
            "chain": "base",
            "type": "alice_escrow", 
            "txHash": "0x276d5812b168d906b65219f0dd740c822a1faa83f85607692d6e6595e04344ba"
        },
        {
            "chain": "monad",
            "type": "bob_escrow",
            "txHash": "0xb6941c27ce4873e8c9969bb8c03169c83fbfd189846856fbfed55ef2b114c52e"
        },
        {
            "chain": "monad", 
            "type": "alice_claim",
            "txHash": "0xc48a7e0e597bb2a728eb2ee9971f188483d2261b37ac7793e9a36503d4835525"
        },
        {
            "chain": "base",
            "type": "bob_claim", 
            "txHash": "0x77dfd49e1f451553f0aaa8d9696308091641a39e08d0b806a6d2737667134897"
        }
    ],
    "atomicSwapSteps": {
        "escrowsCreated": 2,
        "claimsCompleted": 2, 
        "totalTransactions": 4
    }
}
```

### **Verification Commands**
```bash
# Verify Base transaction
curl "https://sepolia.basescan.org/api?module=transaction&action=gettxreceiptstatus&txhash=0x276d5812b168d906b65219f0dd740c822a1faa83f85607692d6e6595e04344ba"

# Verify Monad transaction  
curl "https://testnet-rpc.monad.xyz" -X POST -H "Content-Type: application/json" \
  -d '{"method":"eth_getTransactionReceipt","params":["0xb6941c27ce4873e8c9969bb8c03169c83fbfd189846856fbfed55ef2b114c52e"],"id":1}'
```

---

## 🚀 **Performance Optimizations**

### **1. Parallel Tool Execution**
```typescript
// Execute multiple blockchain operations simultaneously
const [aliceResult, bobResult] = await Promise.all([
    aliceAdapter.createHTLC(swapOrder),
    bobAdapter.createHTLC(swapOrder)
]);
```

### **2. Retry Logic for Blockchain Timing**
```typescript
// Handle blockchain object propagation delays
async function waitForSuiObject(objectId: string, maxRetries = 10) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            await suiClient.getObject({ id: objectId });
            return true;
        } catch (e) {
            if (i === maxRetries - 1) throw e;
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
}
```

### **3. Gas Optimization**
```solidity
// Efficient event emission for escrow ID extraction
event EscrowCreated(
    bytes32 indexed escrowId,
    address indexed sender,
    address indexed receiver,
    uint256 amount,
    string orderId
);
```

---

## 🔧 **Development Setup**

### **Environment Variables**
```bash
# Base Sepolia
BASE_RPC_URL=https://sepolia.base.org
BASE_PRIVATE_KEY=0x...
BASE_PRIVATE_KEY_2=0x...

# Monad Testnet  
MONAD_RPC_URL=https://testnet-rpc.monad.xyz
MONAD_PRIVATE_KEY=0x...
MONAD_PRIVATE_KEY_2=0x...

# Sui Testnet
SUI_RPC_URL=https://fullnode.testnet.sui.io:443
SUI_PRIVATE_KEY=0x...
SUI_PRIVATE_KEY_2=0x...
```

### **Build & Deploy**
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Deploy contracts (if needed)
cd contracts/monad
forge create HTLCEscrow --rpc-url $MONAD_RPC_URL --private-key $MONAD_PRIVATE_KEY

cd ../sui  
sui client publish --gas-budget 100000000
```

---

## 📊 **Technical Metrics**

| Metric | Base→Monad | Base→Sui | Base→Stellar |
|--------|------------|----------|---------------|
| **Total Transactions** | 4 | 4 | 3 |
| **Atomic Guarantee** | ✅ Full | ✅ Full | ⚠️ Partial |
| **Secret Validation** | ✅ Contract | ✅ Contract | ❌ Fallback |
| **Gas Efficiency** | ~500k gas | ~200k gas | ~100k XLM |
| **Confirmation Time** | ~30 seconds | ~5 seconds | ~10 seconds |

---

**Built with ❤️ for the 1inch Hackathon** 🚀