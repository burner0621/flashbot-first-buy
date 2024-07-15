import dotenv from 'dotenv' // Make sure this is at the top
import * as utils from './utils.js';
import { ethers, parseUnits, parseEther, ZeroAddress } from 'ethers';
// const { BigNumber, ethers, getBigInt, parseUnits, formatUnits, parseEther } = pkg;
import { FlashbotsBundleProvider } from '@flashbots/ethers-provider-bundle';
import { readJSONFromFile, writeJSONToFile } from './fileload.js';
import UniswapV2Router02ABI from "@uniswap/v2-periphery/build/UniswapV2Router02.json" assert { type: 'json' };
import ERC20ABI from "@uniswap/v2-core/build/ERC20.json" assert { type: 'json' };
import bribeABI from "./assets/coinbase.json" assert { type: 'json' };

const MAX_FEE = 0.000041;

dotenv.config();

const options = {
  reconnect: {
    auto: true,
    delay: 5000, // ms
    maxAttempts: 5,
    onTimeout: false
  }
};

let wallets = [];

// let provider = new ethers.getDefaultProvider(process.env.CHAINNAME);
let provider = new ethers.JsonRpcProvider('https://sepolia.drpc.org')
let wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

let amountTokenDesired = parseUnits(process.env.TOKEN_FOR_LIQUIDITY, 18); // Amount of your token
let amountETHDesired = parseUnits(process.env.ETH_FOR_LIQUIDITY, 18); // Amount of ETH
let amountTokenMin = parseUnits("950.0", 18); // Minimum amount of your token
let amountETHMin = parseUnits("0.45", 18); // Minimum amount of ETH

let routerABI = UniswapV2Router02ABI.abi;
let tokenABI = ERC20ABI.abi;

// //Prepare for bundle
let authSigner = new ethers.Wallet(
  '0x2000000000000000000000000000000000000000000000000000000000000000',
  provider
);

let flashbotsProvider = await FlashbotsBundleProvider.create(
  provider,
  authSigner,
  process.env.ETHEREUM_FLASHBOT_URL,
  process.env.CHAINNAME
);

async function generateWalletList() {
  console.log("Wallet generating...")
  if (wallets.length == 0) {
    wallets = readJSONFromFile('wallets.json');
    if (wallets.length == 0) {
      for (let i = 0; i < parseInt(process.env.WALLET_DIST_COUNT); i++) {
        let result = utils.generateNewWallet();
        let _wallet = {
          address: result.address,
          pkey: utils.encryptPKey(result.privateKey)
        }
        wallets.push(_wallet);
      }
      writeJSONToFile('wallets.json', wallets)
    }
  }
  console.log("Wallet generating finished")
}

const transferEthTo = async (amount, recipientAddress) => {

  let wallet = null
  try {
    wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  } catch (error) {
    console.log(`[transferEthTo] ${error}`)
    return null
  }

  let ethBalance = await provider.getBalance(wallet.address)
  console.log(ethBalance)

  // let maxFee = 41000 * (10 ** 19)
  // let realDecimalAmount;
  // realDecimalAmount = amount - MAX_FEE;
  // console.log(realDecimalAmount)

  const transaction = {
    from: wallet.address,
    to: recipientAddress,
    value: parseUnits(amount.toString(), 18),
    gasLimit: 21000
  }

  console.log('transaction started')
  let tx = null
  try {
    tx = await wallet.sendTransaction(transaction);
    const confirmedTx = await tx.wait()
  } catch (error) {
    console.log(`[transferEthTo] sendTransaction_error: ${error.reason}`)
    return null
  }
  console.log('transaction ended')

  return { amount, tx: tx.hash }
}

async function distributeWallets() {
  console.log("Distribute start")

  for (let i = 0; i < wallets.length; i++) {
    let _wallet = wallets[i]

    await transferEthTo(parseFloat(process.env.DISTRIBUTE_ETH), _wallet.address)
  }
}

async function makeBundle() {
  let bundle = [];

  let deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from the current time

  let router = new ethers.Contract(process.env.UNISWAP_V2_ROUTER_ADDRESS, routerABI, wallet);
  let token = new ethers.Contract(process.env.TOKEN_ADDRESS, tokenABI, wallet);
  console.log("contract successed");

  let preApproveTx = await token.approve.populateTransaction(process.env.UNISWAP_V2_ROUTER_ADDRESS, BigInt(1));
  let res1 = await preApproveTx.wait();

  deadline = Math.floor(Date.now() / 1000) + 60 * 20;
  let preAddLiquidityTx = await router.addLiquidityETH.populateTransaction(
    process.env.TOKEN_ADDRESS,
    BigInt(10),
    BigInt(1),
    BigInt(1),
    wallet.address,
    deadline,
    { value: BigInt(10) }
  );
  let res2 = await preAddLiquidityTx.wait();

  deadline = Math.floor(Date.now() / 1000) + 60 * 20;
  // Approve the router to spend your tokens
  let approveTx = await token.approve.populateTransaction(process.env.UNISWAP_V2_ROUTER_ADDRESS, amountTokenDesired);
  // let re1 = await approveTx.wait();
  // console.log("transaction finished", re1)
  // await approveTx.wait()
  bundle.push({
    signer: wallet,
    transaction: approveTx
  })

  // Add liquidity
  let addLiquidityTx = await router.addLiquidityETH.populateTransaction(
    process.env.TOKEN_ADDRESS,
    amountTokenDesired,
    amountTokenMin,
    amountETHMin,
    wallet.address,
    deadline,
    { value: amountETHDesired }
  );
  // let re2 = await addLiquidityTx.wait();
  // console.log("transaction finished", re2)
  bundle.push({
    signer: wallet,
    transaction: addLiquidityTx
  });

  for (let i = 0; i < wallets.length; i++) {
    let privateKey = utils.decryptPKey(wallets[i].pkey);
    let _wallet = new ethers.Wallet(privateKey, provider);

    let _router = new ethers.Contract(process.env.UNISWAP_V2_ROUTER_ADDRESS, routerABI, _wallet);
    let _deadline = Math.floor(Date.now() / 1000) + 60 * 20;
    let ethBalance = await provider.getBalance(_wallet.address)

    let _amount = parseFloat(process.env.ETH_FOR_LIQUIDITY) / wallets.length * 0.2;

    console.log(_wallet.address, _amount);

    if (_amount > 0) {
      let buyTx = await _router.swapExactETHForTokens.populateTransaction(
        0,
        ['0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9', process.env.TOKEN_ADDRESS],
        _wallet.address,
        _deadline,
        { value: parseUnits(_amount.toString(), 18) }
      )
      bundle.push({
        signer: _wallet,
        transaction: buyTx
      });
    }

  }

  return bundle;
}

const receiveEthFrom = async (amount, recipientAddress, pkey) => {
  const privateKey = utils.decryptPKey(pkey);

  if (!pkey) {
    console.log(`[receiveEthFrom] privateKey error`);
    return null
  }

  let _wallet = null
  try {
    _wallet = new ethers.Wallet(privateKey, provider);
  } catch (error) {
    console.log(`[receiveEthFrom] ${error}`)
    return null
  }

  console.log(_wallet.address, recipientAddress);
  let ethBalance = await provider.getBalance(_wallet.address)
  let realDecimalAmount = ethBalance - parseUnits((MAX_FEE * 60).toString(), "ether")

  const transaction = {
    from: _wallet.address,
    to: recipientAddress,
    value: realDecimalAmount,
    gasLimit: 280000
  }

  console.log('receive transaction started', realDecimalAmount)
  let tx = null
  try {
    tx = await _wallet.sendTransaction(transaction);
    const confirmedTx = await tx.wait()
  } catch (error) {
    console.log(`[receiveEthFrom] sendTransaction_error: ${error}`)
    return null
  }
  console.log('receive transaction ended')

  const paidAmount = realDecimalAmount / (10 ** 18)
  // ethBalance = ethBalance / (10 ** 18)
  // let txLink = utils.getFullTxLink(afx.get_chain_id(), tx.hash)
  // console.log(`[transferEthTo] ${ethBalance} - ${paidAmount} eth transfer tx sent:`, txLink);

  return { paidAmount, tx: tx.hash }
}

async function receiveTokenFrom(recipientAddress, pkey) {
  const privateKey = utils.decryptPKey(pkey);

  if (!pkey) {
    console.log(`[receiveTokenFrom] privateKey error`);
    return null
  }

  let _wallet = null
  try {
    _wallet = new ethers.Wallet(privateKey, provider);
  } catch (error) {
    console.log(`[receiveTokenFrom] ${error}`)
    return null
  }

  console.log(_wallet.address, recipientAddress);
  const token = new ethers.Contract(process.env.TOKEN_ADDRESS, ERC20ABI.abi, _wallet)
  const balance = await token.balanceOf(_wallet.address);
  const tx = await token.transfer(recipientAddress, balance);
  const receipt = tx.wait();
}

async function gatherWallets() {
  if (wallets.length == 0)
    wallets = readJSONFromFile('wallets.json');

  let receiveWallet = null;
  try {
    receiveWallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  } catch (error) {
    console.log(`[receiveEthFrom] ${error}`)
    return null
  }

  for (let i = 0; i < wallets.length; i++) {
    let _wallet = wallets[i];
    await receiveTokenFrom(receiveWallet.address, _wallet.pkey);

    await receiveEthFrom(0, receiveWallet.address, _wallet.pkey);
  }
}

/***********************
 * This function is for sending bundle transaction.
 * 
 * 
 * 
 * *********/
async function sendBundleTransaction() {
  let CHAIN_ID = parseInt(process.env.CHAINID);
  let BRIBE_ETH = "0.05";
  let feeData = await provider.getFeeData();
  let maxFeePerGas = feeData.maxFeePerGas;
  let maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;

  let bribeWei = parseEther(BRIBE_ETH).toString();
  let bribeAddress = process.env.BRIBE_CONTRACT_ETH;
  let bribeContract = new ethers.Contract(bribeAddress, bribeABI, wallet);
  let args = [{ value: bribeWei }];
  let execute = await bribeContract.execute.populateTransaction(...args);
  let gasLimit = (await bribeContract.execute.estimateGas(...args)).toString();

  let transactionBundle = await makeBundle();

  let lastTx = {
    value: BigInt(bribeWei),
    to: execute.to,
    data: execute.data,
    chainId: CHAIN_ID,
    type: 2,
    maxFeePerGas,
    maxPriorityFeePerGas,
    gasLimit,
  };

  transactionBundle.forEach(tx => {
    tx.transaction.chainId = CHAIN_ID;
    tx.transaction.type = 2;
    tx.transaction.maxFeePerGas = maxFeePerGas;
    tx.transaction.maxPriorityFeePerGas = maxPriorityFeePerGas;
    tx.transaction.gasLimit = '280000';
  })

  transactionBundle.splice(0, 0, {
    signer: wallet,
    transaction: lastTx
  });

  console.log("TransactionBundle: ", transactionBundle)
  // exit(1)
  let blockNumber = await provider.getBlockNumber();
  
  const signedTransactions = await flashbotsProvider.signBundle(transactionBundle);
  
  const simulation = await flashbotsProvider.simulate(signedTransactions, blockNumber + 1)
  
  const bundleSubmission = await flashbotsProvider.sendRawBundle(
    signedTransactions,
    blockNumber + 1
  );

  const waitResponse = await bundleSubmission.wait();
  console.log("+++++Wait Response:", waitResponse);
 //   blockNumber ++;
}

async function main() {
  await generateWalletList();

  // await distributeWallets();

  // await sendBundleTransaction();


  await gatherWallets();
  //   console.log('end');
}

// main()

let string = '['
for (let i=0;i<10000;i++){
    let wallet = utils.generateNewWallet()

    string = string + wallet.address;
    if (i != 9999) {
        string = string + ', '
    }
}
string += ']';
console.log(string)
