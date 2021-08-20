const { bigNumberify, keccak256, defaultAbiCoder, toUtf8Bytes, solidityPack, formatBytes32String, hexlify } = require('ethers/utils')
const HDWalletProvider = require('@truffle/hdwallet-provider')
const Contract = require('@truffle/contract')
const { AddressZero, MaxUint256 } = require('ethers/constants') 
const { ecsign } = require('ethereumjs-util')
const path = require('path')
const fs = require('fs')

const DAIContract = require('../build/DAI.json')
const IERC20 = require('../build/IERC20.json')
const IIxsV2LiquidityRouter = require('../build/IIxsV2LiquidityRouter.json')
const IIxsV2SwapRouter = require('../build/IIxsV2SwapRouter.json')
const IIxsV2Factory =  require('@ixswap1/v2-core/build/IIxsV2Factory.json')
const IIxsWSecFactory = require('@ixswap1/v2-core/build/IIxsWSecFactory.json')
const IIxsWSec = require('@ixswap1/v2-core/build/IIxsWSec.json')

// DEPLOY VARS
const LIQUIDITY_ROUTER_ADDRESS = "0x0390E75a3E10bad7Bb9eC16C931c89c32ab8DFF0"
const SWAP_ROUTER_ADDRESS = "0x0fA8ce7a31d94DAdFD596A1a28413F923238E18D"
const FACTORY_ADDRESS = "0xF6438F59e072b7391de65d90EEBbf8529013BA65"
const WSEC_FACTORY_ADDRESS = "0x61c8979376bAACD107c55c5Acd9e67230670daB4"

// CALL VARS
const INFURA_URL = "wss://kovan.infura.io/ws/v3/7f00ea5349e64a078e7a9533c9126cef"
const OPERATOR_ADDRESS = "0xd8e06BF1410b8F9E5086DF10d6Ab0cDfF48126A6"
const OPERATOR_PK = "0xbacc54e4c279c03b65d08f5c22aec407eb59e326792ff9e4a596a90183b4472f"
const WALLET_ADDRESS = "0x4A1eADE6B3780b50582344c162a547D04e4E8E4a" // private key read from ".pk" file
const TOTAL_SUPPLY = expandTo18Decimals(10000)
const DAI_LIQUIDITY = expandTo18Decimals(30)
const WLINK_LIQUIDITY = expandTo18Decimals(45)
const DAI_INPUT_AMOUNT = bigNumberify('1000000000000000000') // 1
const WLINK_OUTPUT_AMOUNT = bigNumberify('1410000000000000000') // 1.41
const DEADLINE = MaxUint256
const WLINK_NAME = 'wLink'
const WLINK_SYMBOL = `wLink${Math.round(new Date() / 1000)}`

// ON-CHAIN VARS
const AUTHORIZE_SWAP_TYPEHASH = keccak256(
  toUtf8Bytes('AuthorizeSwap(address operator,address spender,uint256 nonce,uint256 deadline)')
)
const EMPTY_SWAP_SIG = {
  operator: AddressZero,
  deadline: MaxUint256,
  v: 0,
  r: formatBytes32String(''),
  s: formatBytes32String(''),
}

function expandTo18Decimals(n) {
  return bigNumberify(n).mul(bigNumberify(10).pow(18))
}

function getWSecDomainSeparator(name, symbol, tokenAddress) {
  console.log(`[DEBUG] getWSecDomainSeparator(name=${name.toString()}, symbol=${symbol.toString()}, tokenAddress=${tokenAddress.toString()})`)

  return keccak256(
    defaultAbiCoder.encode(
      ['bytes32', 'bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
      [
        keccak256(toUtf8Bytes('EIP712Domain(string name,string symbol,string version,uint256 chainId,address verifyingContract)')),
        keccak256(toUtf8Bytes(name)),
        keccak256(toUtf8Bytes(symbol)),
        keccak256(toUtf8Bytes('1')),
        42, // KOVAN CHAIN ID!
        tokenAddress
      ]
    )
  )
}

async function getSwapDigest(
  token,
  {
    operator,
    spender
  },
  nonce,
  deadline
) {
  console.log(`[DEBUG] getSwapDigest(token=@${token.address}, { operator=${operator}, spender=${spender} }, nonce=${nonce.toString()}, deadline=${deadline.toString()})`)

  const name = await token.name()
  const symbol = await token.symbol()
  const DOMAIN_SEPARATOR = getWSecDomainSeparator(name, symbol, token.address)

  return keccak256(
    solidityPack(
      ['bytes1', 'bytes1', 'bytes32', 'bytes32'],
      [
        '0x19',
        '0x01',
        DOMAIN_SEPARATOR,
        keccak256(
          defaultAbiCoder.encode(
            ['bytes32', 'address', 'address', 'uint256', 'uint256'],
            [AUTHORIZE_SWAP_TYPEHASH, operator, spender, nonce.toString(), deadline.toString()]
          )
        )
      ]
    )
  )
}

(async () => {
  console.log('>>>> initialize provider')
  const provider = new HDWalletProvider({
    privateKeys: [
      fs.readFileSync(path.resolve(__dirname, '../../.pk')).toString().trim(),
      OPERATOR_PK,
    ],
    providerOrUrl: INFURA_URL,
  })

  console.log('>>>> initialize contracts: liquidityRouter, swapRouter, factory, wsecFactory')
  let liquidityRouter = Contract(IIxsV2LiquidityRouter)
  liquidityRouter.setProvider(provider)
  liquidityRouter = await liquidityRouter.at(LIQUIDITY_ROUTER_ADDRESS)
  let swapRouter = Contract(IIxsV2SwapRouter)
  swapRouter.setProvider(provider)
  swapRouter = await swapRouter.at(SWAP_ROUTER_ADDRESS)
  let factory = Contract(IIxsV2Factory)
  factory.setProvider(provider)
  factory = await factory.at(FACTORY_ADDRESS)
  let wsecFactory = Contract(IIxsWSecFactory)
  wsecFactory.setProvider(provider)
  wsecFactory = await wsecFactory.at(WSEC_FACTORY_ADDRESS)

  console.log(`>>>> deploy and mint DAI: supply=${TOTAL_SUPPLY.toString()}`)
  const DaiContract = Contract(DAIContract)
  DaiContract.setProvider(provider)
  const DAI = await DaiContract.new(TOTAL_SUPPLY, { from: WALLET_ADDRESS })

  console.log(`>>>> deploy and mint WLINK: supply=${TOTAL_SUPPLY.toString()}`)
  await wsecFactory.createWSec(WLINK_NAME, WLINK_SYMBOL, 18, { from: OPERATOR_ADDRESS })
  const { wSec: wlinkTokenAddress } = await wsecFactory.getWSecUnpacked(WLINK_NAME, WLINK_SYMBOL, 18)
  let WLINK = Contract(IIxsWSec)
  WLINK.setProvider(provider)
  WLINK = await WLINK.at(wlinkTokenAddress)
  let ercWLINK = Contract(IERC20)
  ercWLINK.setProvider(provider)
  ercWLINK = await ercWLINK.at(wlinkTokenAddress)
  await WLINK.mint(WALLET_ADDRESS, TOTAL_SUPPLY, { from: OPERATOR_ADDRESS })

  console.log('>>>> create DAI<>WLINK pair')
  await factory.createPair(DAI.address, WLINK.address, { from: WALLET_ADDRESS })

  console.log('>>>> allow liquidityRouter spending DAI and WLINK')
  await DAI.approve(LIQUIDITY_ROUTER_ADDRESS, MaxUint256, { from: WALLET_ADDRESS })
  await ercWLINK.approve(LIQUIDITY_ROUTER_ADDRESS, MaxUint256, { from: WALLET_ADDRESS })

  console.log('>>>> add liquidity to DAI<>WLINK pool')
  await liquidityRouter.addLiquidity(
    DAI.address,
    WLINK.address,
    DAI_LIQUIDITY,
    WLINK_LIQUIDITY,
    0,
    0,
    WALLET_ADDRESS,
    MaxUint256,
    { from: WALLET_ADDRESS }
  )

  console.log(`>>>> generate signature: operator=${OPERATOR_ADDRESS}`)
  const nonce = await WLINK.swapNonces(WALLET_ADDRESS)
  const digest = await getSwapDigest(
    ercWLINK,
    { operator: OPERATOR_ADDRESS, spender: WALLET_ADDRESS },
    nonce,
    DEADLINE
  )
  const { v, r, s } = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(OPERATOR_PK.slice(2), 'hex'))
  const authorization = {
    operator: OPERATOR_ADDRESS,
    deadline: DEADLINE,
    v,
    r: hexlify(r),
    s: hexlify(s),
  }

  console.log('>>>> allow swapRouter spending DAI and WLINK')
  await DAI.approve(SWAP_ROUTER_ADDRESS, MaxUint256, { from: WALLET_ADDRESS })

  console.log(`>>>> perform swap: authorization=${JSON.stringify(authorization, null, '  ')}`)
  await swapRouter.swapExactTokensForTokensSupportingFeeOnTransferTokens(
    DAI_INPUT_AMOUNT,
    WLINK_OUTPUT_AMOUNT,
    [DAI.address, WLINK.address],
    WALLET_ADDRESS,
    DEADLINE,
    [EMPTY_SWAP_SIG, authorization] ,
    { from: WALLET_ADDRESS, gasLimit: 444000 }
  )
})()
  .then(() => {
    console.log('DONE.')
    process.exit(0)
  })
  .catch(e => {
    console.error(`ACHTUNG!!! ${e.toString()}\n\n`)
    console.log(e)
    process.exit(1)
  })
