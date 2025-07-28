import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { WorkingCrossChainResolver } from '../resolvers/working-resolver';
import { SwapStatus } from '../core/types';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize cross-chain resolver
const resolver = new WorkingCrossChainResolver();

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get supported chains
app.get('/api/chains', (req, res) => {
  try {
    const chains = resolver.getSupportedChains();
    res.json({ chains });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get chain balance
app.get('/api/balance/:chain/:address/:token', async (req, res) => {
  try {
    const { chain, address, token } = req.params;
    const balance = await resolver.getChainBalance(chain, address, token);
    res.json({ balance: balance.toString() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new cross-chain swap
app.post('/api/swap', async (req, res) => {
  try {
    const {
      srcChain,
      dstChain,
      srcToken,
      dstToken,
      srcAmount,
      dstAmount,
      maker
    } = req.body;

    // Validate required fields
    if (!srcChain || !dstChain || !srcToken || !dstToken || !srcAmount || !dstAmount || !maker) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const swapState = await resolver.createSwap(
      srcChain,
      dstChain,
      srcToken,
      dstToken,
      BigInt(srcAmount),
      BigInt(dstAmount),
      maker
    );

    res.json({
      orderId: swapState.order.orderId,
      status: swapState.status,
      secretHash: swapState.order.secretHash,
      timelock: {
        srcCancellation: swapState.order.timelock.srcCancellation.toString(),
        dstCancellation: swapState.order.timelock.dstCancellation.toString()
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Execute a swap (resolver action)
app.post('/api/swap/:orderId/execute', async (req, res) => {
  try {
    const { orderId } = req.params;
    const result = await resolver.executeSwap(orderId);
    
    if (result.success) {
      res.json({
        success: true,
        srcEscrow: result.srcEscrow?.address,
        dstEscrow: result.dstEscrow?.address,
        txHash: result.txHash
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cancel a swap
app.post('/api/swap/:orderId/cancel', async (req, res) => {
  try {
    const { orderId } = req.params;
    const result = await resolver.cancelSwap(orderId);
    
    if (result.success) {
      res.json({
        success: true,
        txHash: result.txHash
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get swap status
app.get('/api/swap/:orderId', (req, res) => {
  try {
    const { orderId } = req.params;
    const swapState = resolver.getSwapState(orderId);
    
    if (!swapState) {
      return res.status(404).json({ error: 'Swap not found' });
    }

    res.json({
      orderId: swapState.order.orderId,
      status: swapState.status,
      srcChain: swapState.order.srcChainId,
      dstChain: swapState.order.dstChainId,
      srcToken: swapState.order.makerAsset,
      dstToken: swapState.order.takerAsset,
      srcAmount: swapState.order.makingAmount.toString(),
      dstAmount: swapState.order.takingAmount.toString(),
      maker: swapState.order.maker,
      srcEscrow: swapState.srcEscrow?.address,
      dstEscrow: swapState.dstEscrow?.address,
      createdAt: swapState.createdAt,
      updatedAt: swapState.updatedAt
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all swaps
app.get('/api/swaps', (req, res) => {
  try {
    const swaps = resolver.getAllSwaps().map(swap => ({
      orderId: swap.order.orderId,
      status: swap.status,
      srcChain: swap.order.srcChainId,
      dstChain: swap.order.dstChainId,
      srcAmount: swap.order.makingAmount.toString(),
      dstAmount: swap.order.takingAmount.toString(),
      createdAt: swap.createdAt,
      updatedAt: swap.updatedAt
    }));
    
    res.json({ swaps });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Convenience endpoints for bidirectional swaps

// ETH to other chain
app.post('/api/swap/eth-to-chain', async (req, res) => {
  try {
    const { dstChain, srcToken, dstToken, srcAmount, dstAmount, maker } = req.body;
    
    const swapState = await resolver.createEthToChainSwap(
      dstChain, srcToken, dstToken, BigInt(srcAmount), BigInt(dstAmount), maker
    );
    
    res.json({
      orderId: swapState.order.orderId,
      status: swapState.status,
      secretHash: swapState.order.secretHash
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Other chain to ETH
app.post('/api/swap/chain-to-eth', async (req, res) => {
  try {
    const { srcChain, srcToken, dstToken, srcAmount, dstAmount, maker } = req.body;
    
    const swapState = await resolver.createChainToEthSwap(
      srcChain, srcToken, dstToken, BigInt(srcAmount), BigInt(dstAmount), maker
    );
    
    res.json({
      orderId: swapState.order.orderId,
      status: swapState.status,
      secretHash: swapState.order.secretHash
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Demo endpoint - create and execute a sample swap
app.post('/api/demo/swap', async (req, res) => {
  try {
    const {
      srcChain = 'ethereum',
      dstChain = 'stellar',
      srcToken = '0x0000000000000000000000000000000000000000', // ETH
      dstToken = 'native', // XLM
      srcAmount = '1000000000000000000', // 1 ETH in wei
      dstAmount = '10000000', // 1 XLM in stroops
      maker = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' // Default test address
    } = req.body;

    console.log(`Creating demo swap: ${srcChain} -> ${dstChain}`);
    
    // Create swap
    const swapState = await resolver.createSwap(
      srcChain,
      dstChain,
      srcToken,
      dstToken,
      BigInt(srcAmount),
      BigInt(dstAmount),
      maker
    );

    console.log(`Demo swap created: ${swapState.order.orderId}`);

    // Auto-execute after a short delay
    setTimeout(async () => {
      try {
        console.log(`Auto-executing demo swap: ${swapState.order.orderId}`);
        await resolver.executeSwap(swapState.order.orderId);
        console.log(`Demo swap executed successfully`);
      } catch (error) {
        console.error(`Demo swap execution failed:`, error.message);
      }
    }, 2000);

    res.json({
      message: 'Demo swap created and will be executed automatically',
      orderId: swapState.order.orderId,
      status: swapState.status,
      srcChain,
      dstChain,
      secretHash: swapState.order.secretHash
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Fusion+ Multi-Chain Server running on port ${port}`);
  console.log(`📋 API Documentation:`);
  console.log(`  GET  /api/chains - Get supported chains`);
  console.log(`  POST /api/swap - Create a cross-chain swap`);
  console.log(`  POST /api/swap/:orderId/execute - Execute a swap`);
  console.log(`  GET  /api/swap/:orderId - Get swap status`);
  console.log(`  POST /api/demo/swap - Create and auto-execute demo swap`);
  console.log(`\n🔗 Supported chains: ${resolver.getSupportedChains().join(', ')}`);
});

export default app;