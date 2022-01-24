import chai, { expect } from 'chai'
import { solidity, MockProvider, createFixtureLoader, deployContract } from 'ethereum-waffle'
import { Contract } from 'ethers'
import { BigNumber, bigNumberify, hexlify } from 'ethers/utils'
import { MaxUint256 } from 'ethers/constants'
import IIxsV2Pair from '@ixswap1/v2-core/build/IIxsV2Pair.json'

import { v2Fixture } from './shared/fixtures'
import { expandTo18Decimals, getApprovalDigest, getSwapDigest, SecAuthorization, MINIMUM_LIQUIDITY, EMPTY_SWAP_DIGEST, EMPTY_SWAP_SIG } from './shared/utilities'

import DeflatingERC20 from '../build/DeflatingERC20.json'
import DAIContract from '../build/DAI.json'
import WETHContract from '../build/WETH9.json'
import IxsWSec from '@ixswap1/v2-core/build/IxsWSec.json'
import { ecsign } from 'ethereumjs-util'

chai.use(solidity)

const overrides = {
  gasLimit: 9999999
}

const TOTAL_SUPPLY = expandTo18Decimals(10000)
const ZERO_AMOUNT = expandTo18Decimals(0)

describe('IxsV2Router', () => {
  const provider = new MockProvider({
    hardfork: 'istanbul',
    mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
    gasLimit: 9999999
  })
  const [wallet] = provider.getWallets()
  const loadFixture = createFixtureLoader(provider, [wallet])

  let token0: Contract
  let token1: Contract
  let swapRouter: Contract
  let liquidityRouter: Contract
  beforeEach(async function () {
    const fixture = await loadFixture(v2Fixture)
    token0 = fixture.token0
    token1 = fixture.token1
    swapRouter = fixture.swapRouter
    liquidityRouter = fixture.liquidityRouter
  })

  it('quote', async () => {
    expect(await swapRouter.quote(bigNumberify(1), bigNumberify(100), bigNumberify(200))).to.eq(bigNumberify(2))
    expect(await swapRouter.quote(bigNumberify(2), bigNumberify(200), bigNumberify(100))).to.eq(bigNumberify(1))
    await expect(swapRouter.quote(bigNumberify(0), bigNumberify(100), bigNumberify(200))).to.be.revertedWith(
      'IxsV2Library: INSUFFICIENT_AMOUNT'
    )
    await expect(swapRouter.quote(bigNumberify(1), bigNumberify(0), bigNumberify(200))).to.be.revertedWith(
      'IxsV2Library: INSUFFICIENT_LIQUIDITY'
    )
    await expect(swapRouter.quote(bigNumberify(1), bigNumberify(100), bigNumberify(0))).to.be.revertedWith(
      'IxsV2Library: INSUFFICIENT_LIQUIDITY'
    )
  })

  it('getAmountOut:fees', async () => {
    const outFeeCrypto = expandTo18Decimals(2).mul(997).mul(expandTo18Decimals(100)).div(expandTo18Decimals(50).mul(1000).add(expandTo18Decimals(2).mul(997)))
    const outFeeSec = expandTo18Decimals(2).mul(990).mul(expandTo18Decimals(100)).div(expandTo18Decimals(50).mul(1000).add(expandTo18Decimals(2).mul(990)))
    expect(await swapRouter.getAmountOut(expandTo18Decimals(2), expandTo18Decimals(50), expandTo18Decimals(100), false)).to.eq(outFeeCrypto)
    expect(await swapRouter.getAmountOut(expandTo18Decimals(2), expandTo18Decimals(50), expandTo18Decimals(100), true)).to.eq(outFeeSec)
  })

  it('getAmountOut', async () => {
    expect(await swapRouter.getAmountOut(bigNumberify(2), bigNumberify(100), bigNumberify(100), false)).to.eq(bigNumberify(1))
    await expect(swapRouter.getAmountOut(bigNumberify(0), bigNumberify(100), bigNumberify(100), false)).to.be.revertedWith(
      'IxsV2Library: INSUFFICIENT_INPUT_AMOUNT'
    )
    await expect(swapRouter.getAmountOut(bigNumberify(2), bigNumberify(0), bigNumberify(100), false)).to.be.revertedWith(
      'IxsV2Library: INSUFFICIENT_LIQUIDITY'
    )
    await expect(swapRouter.getAmountOut(bigNumberify(2), bigNumberify(100), bigNumberify(0), false)).to.be.revertedWith(
      'IxsV2Library: INSUFFICIENT_LIQUIDITY'
    )
  })

  it('getAmountIn:fees', async () => {
    const inFeeCrypto = expandTo18Decimals(50).mul(expandTo18Decimals(1)).mul(1000).div(expandTo18Decimals(100).sub(expandTo18Decimals(1)).mul(997)).add(1)
    const inFeeSec = expandTo18Decimals(50).mul(expandTo18Decimals(1)).mul(1000).div(expandTo18Decimals(100).sub(expandTo18Decimals(1)).mul(990)).add(1)
    expect(await swapRouter.getAmountIn(expandTo18Decimals(1), expandTo18Decimals(50), expandTo18Decimals(100), false)).to.eq(inFeeCrypto)
    expect(await swapRouter.getAmountIn(expandTo18Decimals(1), expandTo18Decimals(50), expandTo18Decimals(100), true)).to.eq(inFeeSec)
  })

  it('getAmountIn', async () => {
    expect(await swapRouter.getAmountIn(bigNumberify(1), bigNumberify(100), bigNumberify(100), false)).to.eq(bigNumberify(2))
    await expect(swapRouter.getAmountIn(bigNumberify(0), bigNumberify(100), bigNumberify(100), false)).to.be.revertedWith(
      'IxsV2Library: INSUFFICIENT_OUTPUT_AMOUNT'
    )
    await expect(swapRouter.getAmountIn(bigNumberify(1), bigNumberify(0), bigNumberify(100), false)).to.be.revertedWith(
      'IxsV2Library: INSUFFICIENT_LIQUIDITY'
    )
    await expect(swapRouter.getAmountIn(bigNumberify(1), bigNumberify(100), bigNumberify(0), false)).to.be.revertedWith(
      'IxsV2Library: INSUFFICIENT_LIQUIDITY'
    )
  })

  it('getAmountsOut', async () => {
    await token0.approve(liquidityRouter.address, MaxUint256)
    await token1.approve(liquidityRouter.address, MaxUint256)
    await liquidityRouter.addLiquidity(
      token0.address,
      token1.address,
      bigNumberify(10000),
      bigNumberify(10000),
      0,
      0,
      wallet.address,
      MaxUint256,
      false,
      overrides
    )

    await expect(swapRouter.getAmountsOut(bigNumberify(2), [token0.address], [false])).to.be.revertedWith(
      'IxsV2Library: INVALID_PATH'
    )
    const path = [token0.address, token1.address]
    const amountsOut = await swapRouter.getAmountsOut(bigNumberify(2), path, [false, false])
    expect(amountsOut.map((x: any) => x.toString())).to.deep.eq([bigNumberify(2), bigNumberify(1)].map((x: any) => x.toString()))
  })

  it('getAmountsIn', async () => {
    await token0.approve(liquidityRouter.address, MaxUint256)
    await token1.approve(liquidityRouter.address, MaxUint256)
    await liquidityRouter.addLiquidity(
      token0.address,
      token1.address,
      bigNumberify(10000),
      bigNumberify(10000),
      0,
      0,
      wallet.address,
      MaxUint256,
      false,
      overrides
    )

    await expect(swapRouter.getAmountsIn(bigNumberify(1), [token0.address], [false])).to.be.revertedWith(
      'IxsV2Library: INVALID_PATH'
    )
    const path = [token0.address, token1.address]
    const amountsIn = await swapRouter.getAmountsIn(bigNumberify(1), path, [false, false])
    expect(amountsIn.map((x: any) => x.toString())).to.deep.eq([bigNumberify(2), bigNumberify(1)].map((x: any) => x.toString()))
  })
})

describe('fee-on-transfer tokens', () => {
  const provider = new MockProvider({
    hardfork: 'istanbul',
    mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
    gasLimit: 9999999
  })
  const [wallet] = provider.getWallets()
  const loadFixture = createFixtureLoader(provider, [wallet])

  let DTT: Contract
  let WETH: Contract
  let swapRouter: Contract
  let liquidityRouter: Contract
  let pair: Contract
  beforeEach(async function () {
    const fixture = await loadFixture(v2Fixture)

    WETH = fixture.WETH
    swapRouter = fixture.swapRouter
    liquidityRouter = fixture.liquidityRouter

    DTT = await deployContract(wallet, DeflatingERC20, [TOTAL_SUPPLY])

    // make a DTT<>WETH pair
    await fixture.factoryV2.createPair(DTT.address, WETH.address, false)
    const pairAddress = await fixture.factoryV2.getPair(DTT.address, WETH.address)
    pair = new Contract(pairAddress, JSON.stringify(IIxsV2Pair.abi), provider).connect(wallet)
  })

  afterEach(async function () {
    expect(await provider.getBalance(swapRouter.address)).to.eq(0)
  })

  async function addLiquidity(DTTAmount: BigNumber, WETHAmount: BigNumber) {
    await DTT.approve(liquidityRouter.address, MaxUint256)
    await liquidityRouter.addLiquidityETH(DTT.address, DTTAmount, DTTAmount, WETHAmount, wallet.address, MaxUint256, false, {
      ...overrides,
      value: WETHAmount
    })
  }

  it('removeLiquidityETHSupportingFeeOnTransferTokens', async () => {
    const DTTAmount = expandTo18Decimals(1)
    const ETHAmount = expandTo18Decimals(4)
    await addLiquidity(DTTAmount, ETHAmount)

    const DTTInPair = await DTT.balanceOf(pair.address)
    const WETHInPair = await WETH.balanceOf(pair.address)
    const liquidity = await pair.balanceOf(wallet.address)
    const totalSupply = await pair.totalSupply()
    const NaiveDTTExpected = DTTInPair.mul(liquidity).div(totalSupply)
    const WETHExpected = WETHInPair.mul(liquidity).div(totalSupply)

    await pair.approve(liquidityRouter.address, MaxUint256)
    await liquidityRouter.removeLiquidityETHSupportingFeeOnTransferTokens(
      DTT.address,
      liquidity,
      NaiveDTTExpected,
      WETHExpected,
      wallet.address,
      MaxUint256,
      overrides
    )
  })

  it('removeLiquidityETHWithPermitSupportingFeeOnTransferTokens', async () => {
    const DTTAmount = expandTo18Decimals(1)
      .mul(100)
      .div(99)
    const ETHAmount = expandTo18Decimals(4)
    await addLiquidity(DTTAmount, ETHAmount)

    const expectedLiquidity = expandTo18Decimals(2)

    const nonce = await pair.nonces(wallet.address)
    const digest = await getApprovalDigest(
      pair,
      { owner: wallet.address, spender: liquidityRouter.address, value: expectedLiquidity.sub(MINIMUM_LIQUIDITY) },
      nonce,
      MaxUint256
    )
    const { v, r, s } = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(wallet.privateKey.slice(2), 'hex'))

    const DTTInPair = await DTT.balanceOf(pair.address)
    const WETHInPair = await WETH.balanceOf(pair.address)
    const liquidity = await pair.balanceOf(wallet.address)
    const totalSupply = await pair.totalSupply()
    const NaiveDTTExpected = DTTInPair.mul(liquidity).div(totalSupply)
    const WETHExpected = WETHInPair.mul(liquidity).div(totalSupply)

    await pair.approve(liquidityRouter.address, MaxUint256)
    await liquidityRouter.removeLiquidityETHWithPermitSupportingFeeOnTransferTokens(
      DTT.address,
      liquidity,
      NaiveDTTExpected,
      WETHExpected,
      wallet.address,
      MaxUint256,
      false,
      v,
      r,
      s,
      overrides
    )
  })

  describe('swapExactTokensForTokensSupportingFeeOnTransferTokens', () => {
    const DTTAmount = expandTo18Decimals(5)
      .mul(100)
      .div(99)
    const ETHAmount = expandTo18Decimals(10)
    const amountIn = expandTo18Decimals(1)

    beforeEach(async () => {
      await addLiquidity(DTTAmount, ETHAmount)
    })

    it('DTT -> WETH', async () => {
      await DTT.approve(swapRouter.address, MaxUint256)

      await swapRouter.swapExactTokensForTokensSupportingFeeOnTransferTokens(
        amountIn,
        0,
        [DTT.address, WETH.address],
        wallet.address,
        MaxUint256,
        EMPTY_SWAP_DIGEST,
        overrides
      )
    })

    // WETH -> DTT
    it('WETH -> DTT', async () => {
      await WETH.deposit({ value: amountIn }) // mint WETH
      await WETH.approve(swapRouter.address, MaxUint256)

      await swapRouter.swapExactTokensForTokensSupportingFeeOnTransferTokens(
        amountIn,
        0,
        [WETH.address, DTT.address],
        wallet.address,
        MaxUint256,
        EMPTY_SWAP_DIGEST,
        overrides
      )
    })
  })

  // ETH -> DTT
  it('swapExactETHForTokensSupportingFeeOnTransferTokens', async () => {
    const DTTAmount = expandTo18Decimals(10)
      .mul(100)
      .div(99)
    const ETHAmount = expandTo18Decimals(5)
    const swapAmount = expandTo18Decimals(1)
    await addLiquidity(DTTAmount, ETHAmount)

    await swapRouter.swapExactETHForTokensSupportingFeeOnTransferTokens(
      0,
      [WETH.address, DTT.address],
      wallet.address,
      MaxUint256,
      EMPTY_SWAP_DIGEST,
      {
        ...overrides,
        value: swapAmount
      }
    )
  })

  // DTT -> ETH
  it('swapExactTokensForETHSupportingFeeOnTransferTokens', async () => {
    const DTTAmount = expandTo18Decimals(5)
      .mul(100)
      .div(99)
    const ETHAmount = expandTo18Decimals(10)
    const swapAmount = expandTo18Decimals(1)

    await addLiquidity(DTTAmount, ETHAmount)
    await DTT.approve(swapRouter.address, MaxUint256)

    await swapRouter.swapExactTokensForETHSupportingFeeOnTransferTokens(
      swapAmount,
      0,
      [DTT.address, WETH.address],
      wallet.address,
      MaxUint256,
      EMPTY_SWAP_DIGEST,
      overrides
    )
  })
})

describe('fee-on-transfer tokens: reloaded', () => {
  const provider = new MockProvider({
    hardfork: 'istanbul',
    mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
    gasLimit: 9999999
  })
  const [wallet, treasury] = provider.getWallets()
  const loadFixture = createFixtureLoader(provider, [wallet])

  let DTT: Contract
  let DTT2: Contract
  let swapRouter: Contract
  let liquidityRouter: Contract
  let wSecFactory: Contract
  let wsecToken: Contract
  let secPair: Contract
  let token0sec: Contract
  let token1sec: Contract
  let factoryV2: Contract

  beforeEach(async () => {
    const fixture = await loadFixture(v2Fixture)

    swapRouter = fixture.swapRouter
    liquidityRouter = fixture.liquidityRouter
    wSecFactory = fixture.wSecFactory
    wsecToken = fixture.wsecToken
    token0sec = fixture.token0sec
    token1sec = fixture.token1sec
    secPair = fixture.secPair
    factoryV2 = fixture.factoryV2

    DTT = await deployContract(wallet, DeflatingERC20, [TOTAL_SUPPLY])
    DTT2 = await deployContract(wallet, DeflatingERC20, [TOTAL_SUPPLY])

    // make a DTT<>WETH pair
    await factoryV2.createPair(DTT.address, DTT2.address, false)
  })

  afterEach(async function () {
    expect(await provider.getBalance(swapRouter.address)).to.eq(0)
  })

  async function addLiquidity(DTTAmount: BigNumber, DTT2Amount: BigNumber) {
    await DTT.approve(liquidityRouter.address, MaxUint256)
    await DTT2.approve(liquidityRouter.address, MaxUint256)
    await liquidityRouter.addLiquidity(
      DTT.address,
      DTT2.address,
      DTTAmount,
      DTT2Amount,
      DTTAmount,
      DTT2Amount,
      wallet.address,
      MaxUint256,
      false,
      overrides
    )
  }

  describe('swapExactTokensForTokensSupportingFeeOnTransferTokens', () => {
    const DTTAmount = expandTo18Decimals(5)
      .mul(100)
      .div(99)
    const DTT2Amount = expandTo18Decimals(5)
    const amountIn = expandTo18Decimals(1)

    beforeEach(async () => {
      await addLiquidity(DTTAmount, DTT2Amount)
    })

    it('DTT -> DTT2', async () => {
      await DTT.approve(swapRouter.address, MaxUint256)

      await swapRouter.swapExactTokensForTokensSupportingFeeOnTransferTokens(
        amountIn,
        0,
        [DTT.address, DTT2.address],
        wallet.address,
        MaxUint256,
        EMPTY_SWAP_DIGEST,
        overrides
      )
    })
  })

  describe('swapExactTokensForTokensSupportingFeeOnTransferTokens:sec', () => {
    const SEC0Amount = expandTo18Decimals(5)
      .mul(100)
      .div(99)
    const SEC1Amount = expandTo18Decimals(5)
    const amountIn = expandTo18Decimals(1)

    let ERC: Contract
    let SEC: Contract
    let deadline: BigNumber
    let authorization: SecAuthorization
    beforeEach(async () => {
      ERC = token0sec.address == wsecToken.address ? token1sec : token0sec
      SEC = token0sec.address == wsecToken.address ? token0sec : token1sec

      await factoryV2.setFeeTo(treasury.address)
      await factoryV2.setSecFeeTo(treasury.address)

      await token0sec.approve(liquidityRouter.address, MaxUint256)
      await token1sec.approve(liquidityRouter.address, MaxUint256)
      
      await liquidityRouter.addLiquidity(
        token0sec.address,
        token1sec.address,
        SEC0Amount,
        SEC1Amount,
        SEC0Amount,
        SEC1Amount,
        wallet.address,
        MaxUint256,
        false,
        overrides
      )

      deadline = MaxUint256
      const nonce = await wsecToken.swapNonces(wallet.address)
      const digest = await getSwapDigest(
        wsecToken,
        { operator: wallet.address, spender: wallet.address },
        nonce,
        deadline
      )

      const { v, r, s } = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(wallet.privateKey.slice(2), 'hex'))
      authorization = {
        operator: wallet.address,
        deadline,
        v,
        r: hexlify(r),
        s: hexlify(s),
      }
    })

    it('ERC -> SEC', async () => {
      await ERC.approve(swapRouter.address, MaxUint256)

      await swapRouter.swapExactTokensForTokensSupportingFeeOnTransferTokens(
        amountIn,
        ZERO_AMOUNT,
        [ERC.address, SEC.address],
        wallet.address,
        deadline,
        [EMPTY_SWAP_SIG, authorization],
        overrides
      )
    })

    it('SEC -> ERC', async () => {
      await SEC.approve(swapRouter.address, MaxUint256)

      await swapRouter.swapExactTokensForTokensSupportingFeeOnTransferTokens(
        amountIn,
        ZERO_AMOUNT,
        [SEC.address, ERC.address],
        wallet.address,
        deadline,
        [authorization, EMPTY_SWAP_SIG],
        overrides
      )
    })
  })

  describe('special use-cases', () => {
    beforeEach(async () => {
      await factoryV2.setFeeTo(treasury.address)
      await factoryV2.setSecFeeTo(treasury.address)
    })

    it('DAI -> WLINK (yarik)', async () => {
      // deploy DAI
      const DAI = await deployContract(wallet, DAIContract, [TOTAL_SUPPLY])

      // deploy wLink2
      await wSecFactory.createWSec('wLink2', 'wLink2', 18)
      const { wSec: wlinkTokenAddress } = await wSecFactory.getWSecUnpacked('wLink2', 'wLink2', 18)
      const WLINK = new Contract(wlinkTokenAddress, JSON.stringify(IxsWSec.abi), provider).connect(wallet)
      await WLINK.mint(wallet.address, TOTAL_SUPPLY)

      // make a DAI<>wLink2 pair
      await factoryV2.createPair(DAI.address, WLINK.address, false)

      const deadline = MaxUint256
      const nonce = await WLINK.swapNonces(wallet.address)
      const digest = await getSwapDigest(
        WLINK,
        { operator: wallet.address, spender: wallet.address },
        nonce,
        deadline
      )

      const { v, r, s } = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(wallet.privateKey.slice(2), 'hex'))
      const authorization = {
        operator: wallet.address,
        deadline,
        v,
        r: hexlify(r),
        s: hexlify(s),
      }

      await DAI.approve(liquidityRouter.address, MaxUint256)
      await WLINK.approve(liquidityRouter.address, MaxUint256)

      await liquidityRouter.addLiquidity(
        DAI.address,
        WLINK.address,
        expandTo18Decimals(30),
        expandTo18Decimals(45),
        0,
        0,
        wallet.address,
        MaxUint256,
        false
      )

      await DAI.approve(swapRouter.address, MaxUint256)

      await swapRouter.swapExactTokensForTokensSupportingFeeOnTransferTokens(
        expandTo18Decimals(1),
        0,
        [DAI.address, WLINK.address],
        wallet.address,
        deadline,
        [EMPTY_SWAP_SIG, authorization],
        overrides
      )
      
      expect(await WLINK.balanceOf(wallet.address)).to.eq('9956437560503388189738')
    })

    it('DAI -> WLINK -> WETH (multihop)', async () => {
      const LIQUIDITY_AMOUNT = expandTo18Decimals(1000)

      // deploy DAI
      const DAI = await deployContract(wallet, DAIContract, [LIQUIDITY_AMOUNT.add(expandTo18Decimals(10))])

      // deploy WETH
      const WETH = await deployContract(wallet, WETHContract, [])
      await WETH.deposit({ value: LIQUIDITY_AMOUNT }) // mint

      // deploy wLink2
      await wSecFactory.createWSec('wLink2', 'wLink2', 18)
      const { wSec: wlinkTokenAddress } = await wSecFactory.getWSecUnpacked('wLink2', 'wLink2', 18)
      const WLINK = new Contract(wlinkTokenAddress, JSON.stringify(IxsWSec.abi), provider).connect(wallet)
      await WLINK.mint(wallet.address, LIQUIDITY_AMOUNT.mul(2))

      // make a DAI<>wLink2 pair
      await factoryV2.createPair(DAI.address, WLINK.address, false)

      // make a wLink2<>WETH pair
      await factoryV2.createPair(WLINK.address, WETH.address, false)

      const deadline = MaxUint256
      const nonce = await WLINK.swapNonces(wallet.address)
      const nonce2 = nonce.add(1)
      const digest = await getSwapDigest(
        WLINK,
        { operator: wallet.address, spender: wallet.address },
        nonce,
        deadline
      )
      const digest2 = await getSwapDigest(
        WLINK,
        { operator: wallet.address, spender: wallet.address },
        nonce2,
        deadline
      )

      const { v, r, s } = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(wallet.privateKey.slice(2), 'hex'))
      const { v: v2, r: r2, s: s2 } = ecsign(Buffer.from(digest2.slice(2), 'hex'), Buffer.from(wallet.privateKey.slice(2), 'hex'))
      const authorization = {
        operator: wallet.address,
        deadline,
        v,
        r: hexlify(r),
        s: hexlify(s),
      }
      const authorization2 = {
        operator: wallet.address,
        deadline,
        v: v2,
        r: hexlify(r2),
        s: hexlify(s2),
      }

      await DAI.approve(liquidityRouter.address, MaxUint256)
      await WETH.approve(liquidityRouter.address, MaxUint256)
      await WLINK.approve(liquidityRouter.address, MaxUint256)

      // add DAI<>wLink2 liquitity
      await liquidityRouter.addLiquidity(
        DAI.address,
        WLINK.address,
        LIQUIDITY_AMOUNT,
        LIQUIDITY_AMOUNT,
        0,
        0,
        wallet.address,
        MaxUint256,
        false
      )

      // add wLink2<>WETH liquitity
      await liquidityRouter.addLiquidity(
        WLINK.address,
        WETH.address,
        LIQUIDITY_AMOUNT,
        LIQUIDITY_AMOUNT,
        0,
        0,
        wallet.address,
        MaxUint256,
        false
      )

      await DAI.approve(swapRouter.address, MaxUint256)

      await swapRouter.swapExactTokensForTokensSupportingFeeOnTransferTokens(
        expandTo18Decimals(5),
        0,
        [DAI.address, WLINK.address, WETH.address],
        wallet.address,
        deadline,
        [EMPTY_SWAP_SIG, authorization, EMPTY_SWAP_SIG],
        overrides
      )
      
      await swapRouter.swapExactTokensForTokensSupportingFeeOnTransferTokens(
        expandTo18Decimals(5),
        0,
        [DAI.address, WLINK.address, WETH.address],
        wallet.address,
        deadline,
        [EMPTY_SWAP_SIG, authorization2, EMPTY_SWAP_SIG],
        overrides
      )

      expect(await WETH.balanceOf(wallet.address)).to.eq('9611175416784232097')
    })
  })
})
