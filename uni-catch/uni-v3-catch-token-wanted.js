
import { UniswapV3FactoryContractAddress, uniswapV3RouterAddress, WETH_ADDRESS, USDT_ADDRESS, USDC_ADDRESS, ETH_USDC_V3_PAIR_ADDRESS, UNISWAP_V3_SUBGRAPH_URL, } from './const.js';
import { UNISWAP_V3_FACTORY_ABI } from '../abi/uniswapv3-factory-abi.js'
import * as afx from '../global.js'
// const factoryABI = [{
// 	"anonymous": false,
// 	"inputs": [
// 		{ "indexed": true, "internalType": "address", "name": "token0", "type": "address" },
// 		{ "indexed": true, "internalType": "address", "name": "token1", "type": "address" },
// 		{ "indexed": false, "internalType": "uint24", "name": "fee", "type": "uint24" },
// 		{ "indexed": false, "internalType": "int24", "name": "tickSpacing", "type": "int24" },
// 		{ "indexed": false, "internalType": "address", "name": "pool", "type": "address" }
// 	],
// 	"name": "PoolCreated",
// 	"type": "event"
// }
// ];

const mintABI = [
	{
		"anonymous": false,
		"inputs": [
			{ "indexed": false, "internalType": "address", "name": "sender", "type": "address" },
			{ "indexed": true, "internalType": "address", "name": "owner", "type": "address" },
			{ "indexed": true, "internalType": "int24", "name": "tickLower", "type": "int24" },
			{ "indexed": true, "internalType": "int24", "name": "tickUpper", "type": "int24" },
			{ "indexed": false, "internalType": "uint128", "name": "amount", "type": "uint128" },
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
	let poolAddress = event.returnValues.pool;

	console.log("------------");
	console.log("[v3] Transaction", transactionHash);
	console.log('\x1b[32m%s\x1b[0m', "[v3] Pool has been created " + poolAddress);

	let txReceipt = null;
	try {
		txReceipt = await web3.eth.getTransactionReceipt(transactionHash);
	} catch (error) {
		afx.error_log('processPoolCreatedEvent', error)
		return
	}
	if (!txReceipt) {
		return;
	}

	const mintEventSigHash = web3.utils.keccak256('Mint(address,address,int24,int24,uint128,uint256,uint256)').slice(0, 10);
	const mintLog = txReceipt.logs.find((log) => log.topics[0].startsWith(mintEventSigHash) && log.address === poolAddress);

	if (mintLog) {

		try {
			const mintEventInfo = web3.eth.abi.decodeLog(mintABI[0].inputs, mintLog.data, mintLog.topics.slice(1));
			if (mintEventInfo) {

				let poolInfo = {};
				poolInfo.poolAddress = poolAddress;
				if (! await validatePool(poolAddress, token0, token1, mintEventInfo.amount0, mintEventInfo.amount1, poolInfo)) {

					console.log("[v3, Warning]", "Token validation failed", token0, token1, mintEventInfo);
					return;
				}

				poolInfo.routerAddress = uniswapV3RouterAddress

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
				// 		callback(poolInfo, utils);
				// 	}
				// }

			} else {

				console.log('[v3, Warning] Decoded failed', mintLog.data);
			}
		} catch (error) {
			afx.error_log('[v3, Warning]', error)
		}

	} else {

		console.log('[v3] MEL not found');
	}
}

const Test = (web3, event, callback) => {

	processPoolCreatedEvent(web3, event, callback);
}

export const EventListener = (web3, callback) => {

	const factoryContract = new web3.eth.Contract(UNISWAP_V3_FACTORY_ABI, UniswapV3FactoryContractAddress);

	// Catch PoolCreated event in Uniswap V2 Protocol
	const subscription = factoryContract.events.PoolCreated({}, async (error, event) => {

		if (!error) {
			processPoolCreatedEvent(web3, event, callback);
		} else {
			console.error("[v3, warn]", error);
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
