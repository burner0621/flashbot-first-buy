import EventEmitter from 'events'

import { ERC20_ABI } from './abi/ERC20_ABI.js'
import { UNILOCKER_ABI } from './abi/unilocker-abi.js'
import { PINKLOCK_ABI } from './abi/pinklock-abi.js'
import { TEAMFINANCE_ABI } from './abi/teamfinance-abi.js'
import { UNISWAP_V2_POOL_ABI } from './abi/uniswapv2-pool-abi.js'
import { ethers } from "ethers";

import * as crypto from './aes.js'

import dotenv from 'dotenv'
dotenv.config()

export const encryptPKey = (text) => {

    if (text.startsWith('0x')) {
        text = text.substring(2)
    }

    // const key = crypto_ysi.randomBytes(32).toString('base64'); 
    // const iv = crypto_ysi.randomBytes(16).toString('base64');
    // console.log('CRYPT_KEY = ' + key + ':' + iv)

    return crypto.aesEncrypt(text, process.env.CRYPT_KEY)
}

export const decryptPKey = (text) => {
    return crypto.aesDecrypt(text, process.env.CRYPT_KEY)
}

export const generateNewWallet = () => {

    try {
        const mnemonic = ethers.Wallet.createRandom().mnemonic;
        const wallet = ethers.Wallet.fromPhrase(mnemonic.phrase);
            
        //const privateKey = wallet.privateKey;
        const privateKey = wallet.privateKey;
        const address = wallet.address;
    
        return {mnemonic: mnemonic.phrase, privateKey, address}

    } catch (error) {

        console.log(error)
        return null
    }
}

