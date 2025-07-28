import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';

interface DeploymentConfig {
  chainName: string;
  rpcUrl: string;
  privateKey: string;
  contractPath: string;
}

const DEPLOYMENT_CONFIGS: DeploymentConfig[] = [
  {
    chainName: 'ethereum',
    rpcUrl: process.env.ETH_RPC_URL || 'https://eth.merkle.io',
    privateKey: process.env.ETH_PRIVATE_KEY || '',
    contractPath: 'contracts/out/HTLCEscrow.sol/HTLCEscrow.json'
  },
  {
    chainName: 'monad',
    rpcUrl: process.env.MONAD_RPC_URL || 'https://monad-testnet-rpc.com',
    privateKey: process.env.MONAD_PRIVATE_KEY || '',
    contractPath: 'contracts/out/HTLCEscrow.sol/HTLCEscrow.json'
  }
];

async function deployContract(config: DeploymentConfig): Promise<string> {
  console.log(`\n🚀 Deploying HTLC contract to ${config.chainName}...`);
  
  // Setup provider and wallet
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const wallet = new ethers.Wallet(config.privateKey, provider);
  
  // Load compiled contract
  const contractPath = path.join(process.cwd(), config.contractPath);
  if (!fs.existsSync(contractPath)) {
    throw new Error(`Contract artifact not found: ${contractPath}. Please run 'forge build' first.`);
  }
  
  const contractArtifact = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  
  // Deploy contract
  const contractFactory = new ethers.ContractFactory(
    contractArtifact.abi,
    contractArtifact.bytecode.object,
    wallet
  );
  
  // Deploy with initial owner as the deployer
  const contract = await contractFactory.deploy(wallet.address);
  await contract.waitForDeployment();
  
  const contractAddress = await contract.getAddress();
  console.log(`✅ ${config.chainName} HTLC deployed at: ${contractAddress}`);
  
  // Verify deployment
  const code = await provider.getCode(contractAddress);
  if (code === '0x') {
    throw new Error('Contract deployment failed - no code at address');
  }
  
  return contractAddress;
}

async function deployAllContracts() {
  console.log('🏗️  Starting HTLC contract deployment...\n');
  
  const deployments: Record<string, string> = {};
  
  for (const config of DEPLOYMENT_CONFIGS) {
    try {
      if (!config.privateKey) {
        console.log(`⚠️  Skipping ${config.chainName} - no private key configured`);
        continue;
      }
      
      const address = await deployContract(config);
      deployments[config.chainName] = address;
      
      // Add delay between deployments
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.error(`❌ Failed to deploy to ${config.chainName}:`, error.message);
    }
  }
  
  // Save deployment addresses
  const deploymentFile = path.join(process.cwd(), 'deployments.json');
  const existingDeployments = fs.existsSync(deploymentFile) 
    ? JSON.parse(fs.readFileSync(deploymentFile, 'utf8'))
    : {};
  
  const updatedDeployments = {
    ...existingDeployments,
    htlc: {
      ...existingDeployments.htlc,
      ...deployments
    },
    timestamp: new Date().toISOString()
  };
  
  fs.writeFileSync(deploymentFile, JSON.stringify(updatedDeployments, null, 2));
  
  console.log('\n📄 Deployment Summary:');
  console.log('='.repeat(50));
  Object.entries(deployments).forEach(([chain, address]) => {
    console.log(`${chain.padEnd(15)}: ${address}`);
  });
  
  console.log(`\n💾 Addresses saved to: ${deploymentFile}`);
  
  if (Object.keys(deployments).length > 0) {
    console.log('\n🎯 Next steps:');
    console.log('1. Update .env with deployed contract addresses');
    console.log('2. Deploy non-EVM contracts (Stellar, Sui, Tron) using their respective tools');
    console.log('3. Test cross-chain swaps with real contracts');
  }
}

// Tron deployment function (requires TronWeb)
async function deployTronContract() {
  console.log('\n🌟 Deploying Tron HTLC contract...');
  
  try {
    // This would require TronBox or TronIDE for actual deployment
    // For now, we'll output the contract for manual deployment
    const contractPath = path.join(process.cwd(), 'contracts/tron/HTLCEscrow.sol');
    const contractCode = fs.readFileSync(contractPath, 'utf8');
    
    const outputPath = path.join(process.cwd(), 'tron-contract-to-deploy.sol');
    fs.writeFileSync(outputPath, contractCode);
    
    console.log(`📝 Tron contract ready for deployment: ${outputPath}`);
    console.log('   Deploy manually using TronBox or TronIDE');
    console.log('   Network: Shasta Testnet or Mainnet');
    
  } catch (error) {
    console.error('❌ Tron contract preparation failed:', error.message);
  }
}

// Stellar deployment function
async function prepareStellarContract() {
  console.log('\n✨ Preparing Stellar HTLC contract...');
  
  try {
    const contractPath = path.join(process.cwd(), 'contracts/stellar/htlc_escrow.rs');
    const contractCode = fs.readFileSync(contractPath, 'utf8');
    
    const outputPath = path.join(process.cwd(), 'stellar-contract-to-deploy.rs');
    fs.writeFileSync(outputPath, contractCode);
    
    console.log(`📝 Stellar contract ready: ${outputPath}`);
    console.log('   Deploy using Soroban CLI:');
    console.log('   soroban contract deploy --wasm htlc_escrow.wasm --network testnet');
    
  } catch (error) {
    console.error('❌ Stellar contract preparation failed:', error.message);
  }
}

// Sui deployment function
async function prepareSuiContract() {
  console.log('\n🔵 Preparing Sui HTLC contract...');
  
  try {
    const contractPath = path.join(process.cwd(), 'contracts/sui/htlc_escrow.move');
    const contractCode = fs.readFileSync(contractPath, 'utf8');
    
    const outputPath = path.join(process.cwd(), 'sui-contract-to-deploy.move');
    fs.writeFileSync(outputPath, contractCode);
    
    console.log(`📝 Sui contract ready: ${outputPath}`);
    console.log('   Deploy using Sui CLI:');
    console.log('   sui client publish --gas-budget 100000000');
    
  } catch (error) {
    console.error('❌ Sui contract preparation failed:', error.message);
  }
}

async function main() {
  try {
    // Deploy EVM contracts (Ethereum, Monad)
    await deployAllContracts();
    
    // Prepare non-EVM contracts
    await deployTronContract();
    await prepareStellarContract();
    await prepareSuiContract();
    
    console.log('\n🎉 Contract deployment preparation complete!');
    
  } catch (error) {
    console.error('💥 Deployment failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { deployAllContracts, deployContract };