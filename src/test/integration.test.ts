import { CrossChainResolver } from '../resolvers/cross-chain-resolver';
import { SwapStatus } from '../core/types';

describe('Cross-Chain Integration Tests', () => {
  let resolver: CrossChainResolver;
  
  beforeAll(() => {
    resolver = new CrossChainResolver();
  });

  describe('Basic Functionality', () => {
    it('should initialize with supported chains', () => {
      const chains = resolver.getSupportedChains();
      expect(chains).toContain('ethereum');
      expect(chains).toContain('stellar');
      expect(chains).toContain('sui');
      expect(chains).toContain('tron');
      expect(chains).toContain('monad');
    });

    it('should create a swap order', async () => {
      const swap = await resolver.createSwap(
        'ethereum',
        'stellar',
        '0x0000000000000000000000000000000000000000', // ETH
        'native', // XLM
        BigInt('1000000000000000000'), // 1 ETH
        BigInt('10000000'), // 1 XLM
        '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
      );

      expect(swap.order.orderId).toBeDefined();
      expect(swap.status).toBe(SwapStatus.CREATED);
      expect(swap.order.srcChainId).toBe('ethereum');
      expect(swap.order.dstChainId).toBe('stellar');
      expect(swap.order.secretHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it('should retrieve swap state', async () => {
      const swap = await resolver.createSwap(
        'ethereum',
        'sui',
        '0x0000000000000000000000000000000000000000',
        '0x2::sui::SUI',
        BigInt('1000000000000000000'),
        BigInt('1000000000'),
        '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
      );

      const retrievedSwap = resolver.getSwapState(swap.order.orderId);
      expect(retrievedSwap).toBeDefined();
      expect(retrievedSwap?.order.orderId).toBe(swap.order.orderId);
      expect(retrievedSwap?.status).toBe(SwapStatus.CREATED);
    });

    it('should create bidirectional swaps', async () => {
      // ETH to Chain
      const ethToChain = await resolver.createEthToChainSwap(
        'tron',
        '0x0000000000000000000000000000000000000000',
        'native',
        BigInt('1000000000000000000'),
        BigInt('1000000'),
        '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
      );

      expect(ethToChain.order.srcChainId).toBe('ethereum');
      expect(ethToChain.order.dstChainId).toBe('tron');

      // Chain to ETH
      const chainToEth = await resolver.createChainToEthSwap(
        'monad',
        'native',
        '0x0000000000000000000000000000000000000000',
        BigInt('1000000000000000000'),
        BigInt('1000000000000000000'),
        '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
      );

      expect(chainToEth.order.srcChainId).toBe('monad');
      expect(chainToEth.order.dstChainId).toBe('ethereum');
    });
  });

  describe('Swap Lifecycle', () => {
    it('should handle swap creation and status tracking', async () => {
      const swap = await resolver.createSwap(
        'ethereum',
        'stellar',
        '0x0000000000000000000000000000000000000000',
        'native',
        BigInt('1000000000000000000'),
        BigInt('10000000'),
        '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
      );

      // Initial state
      expect(swap.status).toBe(SwapStatus.CREATED);
      expect(swap.order.secret).toBeDefined();
      expect(swap.order.secretHash).toBeDefined();

      // Verify timelock structure
      expect(swap.order.timelock.srcWithdrawal).toBeDefined();
      expect(swap.order.timelock.dstWithdrawal).toBeDefined();
      expect(swap.order.timelock.srcCancellation).toBeDefined();
      expect(swap.order.timelock.dstCancellation).toBeDefined();

      // Verify safety deposits
      expect(swap.order.safetyDeposit.src).toBeGreaterThan(0n);
      expect(swap.order.safetyDeposit.dst).toBeGreaterThan(0n);
    });

    // Note: Actual execution tests would require live chain connections
    // These would be integration tests run against testnets
    it.skip('should execute a full swap (requires testnet)', async () => {
      const swap = await resolver.createSwap(
        'ethereum',
        'stellar',
        '0x0000000000000000000000000000000000000000',
        'native',
        BigInt('1000000000000000000'),
        BigInt('10000000'),
        '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
      );

      const result = await resolver.executeSwap(swap.order.orderId);
      expect(result.success).toBe(true);
      expect(result.srcEscrow).toBeDefined();
      expect(result.dstEscrow).toBeDefined();

      const finalState = resolver.getSwapState(swap.order.orderId);
      expect(finalState?.status).toBe(SwapStatus.COMPLETED);
    });

    it.skip('should handle swap cancellation (requires testnet)', async () => {
      const swap = await resolver.createSwap(
        'ethereum',
        'sui',
        '0x0000000000000000000000000000000000000000',
        '0x2::sui::SUI',
        BigInt('1000000000000000000'),
        BigInt('1000000000'),
        '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
      );

      // Wait for timelock to expire (in real test, would mock time)
      const result = await resolver.cancelSwap(swap.order.orderId);
      expect(result.success).toBe(true);

      const finalState = resolver.getSwapState(swap.order.orderId);
      expect(finalState?.status).toBe(SwapStatus.CANCELLED);
    });
  });

  describe('Error Handling', () => {
    it('should reject unsupported chains', async () => {
      await expect(
        resolver.createSwap(
          'unsupported-chain',
          'ethereum',
          'token1',
          'token2',
          BigInt('1000'),
          BigInt('1000'),
          '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
        )
      ).rejects.toThrow('Unsupported chain');
    });

    it('should handle non-existent swap queries', () => {
      const nonExistentSwap = resolver.getSwapState('0xinvalid');
      expect(nonExistentSwap).toBeUndefined();
    });

    it('should reject execution of non-existent swaps', async () => {
      await expect(
        resolver.executeSwap('0xinvalid')
      ).rejects.toThrow('Swap 0xinvalid not found');
    });
  });

  describe('Multi-Chain Support', () => {
    const testCases = [
      { src: 'ethereum', dst: 'stellar', srcToken: 'ETH', dstToken: 'XLM' },
      { src: 'ethereum', dst: 'sui', srcToken: 'ETH', dstToken: 'SUI' },
      { src: 'ethereum', dst: 'tron', srcToken: 'ETH', dstToken: 'TRX' },
      { src: 'ethereum', dst: 'monad', srcToken: 'ETH', dstToken: 'MON' },
    ];

    testCases.forEach(({ src, dst }) => {
      it(`should support ${src} to ${dst} swaps`, async () => {
        const swap = await resolver.createSwap(
          src,
          dst,
          src === 'ethereum' ? '0x0000000000000000000000000000000000000000' : 'native',
          dst === 'ethereum' ? '0x0000000000000000000000000000000000000000' : 'native',
          BigInt('1000000000000000000'),
          BigInt('1000000000'),
          '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
        );

        expect(swap.order.srcChainId).toBe(src);
        expect(swap.order.dstChainId).toBe(dst);
        expect(swap.status).toBe(SwapStatus.CREATED);
      });
    });
  });
});