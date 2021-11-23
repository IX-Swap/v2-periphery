import { Wallet, Contract } from 'ethers'
import { Web3Provider } from 'ethers/providers'
import { deployContract } from 'ethereum-waffle'

import { expandTo18Decimals } from './utilities'

import PairBytecodeProvider from '@ixswap1/v2-core/build/PairBytecodeProvider.json'
import IxsV2Factory from '@ixswap1/v2-core/build/IxsV2Factory.json'
import IIxsV2Pair from '@ixswap1/v2-core/build/IIxsV2Pair.json'
import IxsWSecFactory from '@ixswap1/v2-core/build/IxsWSecFactory.json'
import IxsWSec from '@ixswap1/v2-core/build/IxsWSec.json'

import ERC20 from '../../build/ERC20.json'
import WETH9 from '../../build/WETH9.json'
import IxsV2LiquidityRouter from '../../build/IxsV2LiquidityRouter.json'
import IxsV2SwapRouter from '../../build/IxsV2SwapRouter.json'
import DailySlidingWindowOracle01 from '../../build/DailySlidingWindowOracle01.json'
import RouterEventEmitter from '../../build/RouterEventEmitter.json'

const overrides = {
  gasLimit: 9999999
}

interface V2Fixture {
  token0: Contract
  token1: Contract
  wsecToken: Contract
  token0sec: Contract
  token1sec: Contract
  WETH: Contract
  WETHPartner: Contract
  pairBytecodeProvider: Contract
  factoryV2: Contract
  wSecFactory: Contract
  routerEventEmitter: Contract
  liquidityRouter: Contract
  swapRouter: Contract
  pair: Contract
  secPair: Contract
  WETHPair: Contract
}

export async function v2Fixture(provider: Web3Provider, [wallet]: Wallet[]): Promise<V2Fixture> {
  // deploy tokens
  const tokenA = await deployContract(wallet, ERC20, [expandTo18Decimals(10000)], overrides)
  const tokenB = await deployContract(wallet, ERC20, [expandTo18Decimals(10000)], overrides)
  const WETH = await deployContract(wallet, WETH9, [], overrides)
  const WETHPartner = await deployContract(wallet, ERC20, [expandTo18Decimals(10000)], overrides)

  // deploy V2
  const pairBytecodeProvider = await deployContract(wallet, PairBytecodeProvider, [], overrides)
  const factoryV2 = await deployContract(wallet, IxsV2Factory, [wallet.address, pairBytecodeProvider.address], overrides)

  // deploy oracle
  const oracle = await deployContract(wallet, DailySlidingWindowOracle01, [factoryV2.address], overrides)
  await factoryV2.setOracle(oracle.address, '0x0000000000000000000000000000000000000000000000000000000000000000')
  
  // deploy wsec factory
  const wSecFactory = await deployContract(wallet, IxsWSecFactory, [factoryV2.address, [wallet.address]], overrides)
  await factoryV2.setWSecFactory(wSecFactory.address); // back ref

  // deploy wrapped security
  await wSecFactory.createWSec('Tesla Equity', 'SEC', 18)
  const { wSec: wsecTokenAddress } = await wSecFactory.getWSecUnpacked('Tesla Equity', 'SEC', 18)
  const wsecToken = new Contract(wsecTokenAddress, JSON.stringify(IxsWSec.abi), provider).connect(wallet)
  await wsecToken.mint(wallet.address, expandTo18Decimals(10000))

  // deploy routers
  const liquidityRouter = await deployContract(wallet, IxsV2LiquidityRouter, [factoryV2.address, WETH.address], overrides)
  const swapRouter = await deployContract(wallet, IxsV2SwapRouter, [factoryV2.address, WETH.address], overrides)

  // event emitter for testing
  const routerEventEmitter = await deployContract(wallet, RouterEventEmitter, [], overrides)

  // initialize V2
  await factoryV2.createPair(tokenA.address, tokenB.address)
  const pairAddress = await factoryV2.getPair(tokenA.address, tokenB.address)
  const pair = new Contract(pairAddress, JSON.stringify(IIxsV2Pair.abi), provider).connect(wallet)
  const token0Address = await pair.token0()
  const token0 = tokenA.address === token0Address ? tokenA : tokenB
  const token1 = tokenA.address === token0Address ? tokenB : tokenA

  // initialize sec pair
  await factoryV2.createPair(tokenA.address, wsecToken.address)
  const wsecPairAddress = await factoryV2.getPair(tokenA.address, wsecToken.address)
  const secPair = new Contract(wsecPairAddress, JSON.stringify(IIxsV2Pair.abi), provider).connect(wallet)
  const token0secAddress = await secPair.token0()
  const token0sec = tokenA.address === token0secAddress ? tokenA : wsecToken
  const token1sec = tokenA.address === token0secAddress ? wsecToken : tokenA

  await factoryV2.createPair(WETH.address, WETHPartner.address)
  const WETHPairAddress = await factoryV2.getPair(WETH.address, WETHPartner.address)
  const WETHPair = new Contract(WETHPairAddress, JSON.stringify(IIxsV2Pair.abi), provider).connect(wallet)

  return {
    token0,
    token1,
    token0sec,
    token1sec,
    wsecToken,
    WETH,
    WETHPartner,
    pairBytecodeProvider,
    factoryV2,
    wSecFactory,
    liquidityRouter,
    swapRouter,
    routerEventEmitter,
    pair,
    secPair,
    WETHPair
  }
}
