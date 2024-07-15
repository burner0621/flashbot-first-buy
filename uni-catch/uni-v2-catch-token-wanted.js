
import * as afx from '../global.js'
import { UniswapV2FactoryContractAddress, uniswapV2RouterAddress, WETH_ADDRESS, USDT_ADDRESS, USDC_ADDRESS, ETH_USDC_V2_PAIR_ADDRESS, UNISWAP_V2_SUBGRAPH_URL, } from './const.js';

const factoryABI = [{
	"inputs": [{ "internalType": "address", "name": "_feeToSetter", "type": "address" }],
	"stateMutability": "nonpayable",
	"type": "constructor"
},
{
	"anonymous": false,
	"inputs": [
		{ "indexed": true, "internalType": "address", "name": "token0", "type": "address" },
		{ "indexed": true, "internalType": "address", "name": "token1", "type": "address" },
		{ "indexed": false, "internalType": "address", "name": "pair", "type": "address" },
		{ "indexed": false, "internalType": "uint256", "name": "", "type": "uint256" }
	],
	"name": "PairCreated",
	"type": "event"
}
];

const mintABI = [
	{
		"anonymous": false,
		"inputs": [
			{ "indexed": true, "internalType": "address", "name": "sender", "type": "address" },
			{ "indexed": false, "internalType": "uint256", "name": "amount0", "type": "uint256" },
			{ "indexed": false, "internalType": "uint256", "name": "amount1", "type": "uint256" }
		],
		"name": "Mint",
		"type": "event"
	}
];

const processPoolCreatedEvent = async (web3, event, callback) => {

	if (!event.returnValues) {
		return;
	}

	let transactionHash = event.transactionHash;
	let token0 = event.returnValues.token0;
	let token1 = event.returnValues.token1;
	let poolAddress = event.returnValues.pair;

	console.log("------------");
	console.log("[v2] Transaction", transactionHash);
	console.log('\x1b[32m%s\x1b[0m', "[v2] Pool has been created " + poolAddress);

	let txReceipt = null;
	try {
		txReceipt = await web3.eth.getTransactionReceipt(transactionHash);
	} catch (error) {
		afx.error_log('web3.eth.getTransactionReceipt', error)
		return
	}

	if (!txReceipt) {
		return;
	}

	const mintEventSigHash = web3.utils.keccak256('Mint(address,uint256,uint256)').slice(0, 10);
	const mintLog = txReceipt.logs.find((log) => log.topics[0].startsWith(mintEventSigHash) && log.address === poolAddress);

	if (mintLog) {

		try {
			const mintEventInfo = web3.eth.abi.decodeLog(mintABI[0].inputs, mintLog.data, mintLog.topics.slice(1));
			if (mintEventInfo) {

				let poolInfo = {};

				poolInfo.poolAddress = poolAddress;
				if (! await validatePool(poolAddress, token0, token1, mintEventInfo.amount0, mintEventInfo.amount1, poolInfo)) {

					console.log("[v2, Warning]", "Token validation failed", token0, token1, mintEventInfo);
					return;
				}

				poolInfo.routerAddress = uniswapV2RouterAddress
				if (callback) {
					callback(poolInfo);
				}

				// if (poolInfo.secondaryAddress == WETH_ADDRESS) {

				// 	poolInfo.initialLiquidity = parseFloat(web3.utils.fromWei(poolInfo.secondaryAmount, "ether"))
				// 	poolInfo.trigger = (poolInfo.initialLiquidity >= parseFloat(criteria.minEth));

				// } else if (poolInfo.secondaryAddress == USDT_ADDRESS) {

				// 	poolInfo.initialLiquidity = parseFloat(web3.utils.fromWei(poolInfo.secondaryAmount, "mwei"))
				// 	poolInfo.trigger = (poolInfo.initialLiquidity >= parseFloat(criteria.minUsdt));

				// } else if (poolInfo.secondaryAddress == USDC_ADDRESS) {

				// 	poolInfo.initialLiquidity = parseFloat(web3.utils.fromWei(poolInfo.secondaryAmount, "mwei"))
				// 	poolInfo.trigger = (poolInfo.initialLiquidity >= parseFloat(criteria.minUsdc));

				// }

				// console.log("Triggered: ", poolInfo.trigger);

				// if (poolInfo.trigger) {
				// 	if (callback) {
				// 		callback(poolInfo);
				// 	}
				// }

			} else {

				console.log('[v2, Warning] Decoded failed', mintLog.data);
			}
		} catch (error) {
			// console.log("[v2, Warning]", error);
			afx.error_log('[v2, Warning]', error)
		}

	} else {

		console.log('[v2] MEL not found');
	}
}

export const Test = (web3, callback) => {

	let event = {
		transactionHash: '0x01d59b005490e62117473ceff9b42a3ed25367672dde2d7d542b161371963959',
	
		returnValues:  {
		  token0: '0x1C0519883b1783dC98E050c03e52e55257CAcC28',
		  token1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
		  pair: '0x4E7ABae8418080794b937da1685eBa46f6390dF2'
		},
	  }
	  
	processPoolCreatedEvent(web3, event, callback);
}

export const EventListener = (web3, callback) => {

	const factoryContract = new web3.eth.Contract(factoryABI, UniswapV2FactoryContractAddress);

	// Catch PoolCreated event in Uniswap V2 Protocol
	const subscription = factoryContract.events.PairCreated({}, async (error, event) => {

		if (!error) {
			processPoolCreatedEvent(web3, event, callback);
		} else {
			console.error("[v2, warn]", error);
		}
	});
}

const validatePool = async (poolAddress, token0, token1, amount0, amount1, retVal) => {

	if (token0 === WETH_ADDRESS || token0 === USDT_ADDRESS || token0 === USDC_ADDRESS) {
		retVal.primaryAddress = token1;
		retVal.primaryAmount = amount1;
		retVal.primaryIndex = 1;
		retVal.secondaryAddress = token0;
		retVal.secondaryAmount = amount0;
	} else if (token1 === WETH_ADDRESS || token1 === USDT_ADDRESS || token1 === USDC_ADDRESS) {
		retVal.primaryAddress = token0;
		retVal.primaryAmount = amount0;
		retVal.primaryIndex = 0;
		retVal.secondaryAddress = token1;
		retVal.secondaryAmount = amount1;
	} else {
		return false;
	}

	return true;
}
