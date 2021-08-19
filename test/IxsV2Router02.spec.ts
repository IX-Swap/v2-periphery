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
import IxsWSec from '@ixswap1/v2-core/build/IxsWSec.json'
import { ecsign } from 'ethereumjs-util'

chai.use(solidity)

const overrides = {
  gasLimit: 9999999
}

const TOTAL_SUPPLY = expandTo18Decimals(10000)
const ZERO_AMOUNT = expandTo18Decimals(0)

describe('IxsV2Router02', () => {
  const provider = new MockProvider({
    hardfork: 'istanbul',
    mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
    gasLimit: 9999999
  })
  const [wallet] = provider.getWallets()
  const loadFixture = createFixtureLoader(provider, [wallet])

  let token0: Contract
  let token1: Contract
  let router: Contract
  beforeEach(async function () {
    const fixture = await loadFixture(v2Fixture)
    token0 = fixture.token0
    token1 = fixture.token1
    router = fixture.router02
  })

  it('quote', async () => {
    expect(await router.quote(bigNumberify(1), bigNumberify(100), bigNumberify(200))).to.eq(bigNumberify(2))
    expect(await router.quote(bigNumberify(2), bigNumberify(200), bigNumberify(100))).to.eq(bigNumberify(1))
    await expect(router.quote(bigNumberify(0), bigNumberify(100), bigNumberify(200))).to.be.revertedWith(
      'IxsV2Library: INSUFFICIENT_AMOUNT'
    )
    await expect(router.quote(bigNumberify(1), bigNumberify(0), bigNumberify(200))).to.be.revertedWith(
      'IxsV2Library: INSUFFICIENT_LIQUIDITY'
    )
    await expect(router.quote(bigNumberify(1), bigNumberify(100), bigNumberify(0))).to.be.revertedWith(
      'IxsV2Library: INSUFFICIENT_LIQUIDITY'
    )
  })

  it('getAmountOut:fees', async () => {
    const outFeeCrypto = expandTo18Decimals(2).mul(997).mul(expandTo18Decimals(100)).div(expandTo18Decimals(50).mul(1000).add(expandTo18Decimals(2).mul(997)))
    const outFeeSec = expandTo18Decimals(2).mul(990).mul(expandTo18Decimals(100)).div(expandTo18Decimals(50).mul(1000).add(expandTo18Decimals(2).mul(990)))
    expect(await router.getAmountOut(expandTo18Decimals(2), expandTo18Decimals(50), expandTo18Decimals(100), false)).to.eq(outFeeCrypto)
    expect(await router.getAmountOut(expandTo18Decimals(2), expandTo18Decimals(50), expandTo18Decimals(100), true)).to.eq(outFeeSec)
  })

  it('getAmountOut', async () => {
    expect(await router.getAmountOut(bigNumberify(2), bigNumberify(100), bigNumberify(100), false)).to.eq(bigNumberify(1))
    await expect(router.getAmountOut(bigNumberify(0), bigNumberify(100), bigNumberify(100), false)).to.be.revertedWith(
      'IxsV2Library: INSUFFICIENT_INPUT_AMOUNT'
    )
    await expect(router.getAmountOut(bigNumberify(2), bigNumberify(0), bigNumberify(100), false)).to.be.revertedWith(
      'IxsV2Library: INSUFFICIENT_LIQUIDITY'
    )
    await expect(router.getAmountOut(bigNumberify(2), bigNumberify(100), bigNumberify(0), false)).to.be.revertedWith(
      'IxsV2Library: INSUFFICIENT_LIQUIDITY'
    )
  })

  it('getAmountIn:fees', async () => {
    const inFeeCrypto = expandTo18Decimals(50).mul(expandTo18Decimals(1)).mul(1000).div(expandTo18Decimals(100).sub(expandTo18Decimals(1)).mul(997)).add(1)
    const inFeeSec = expandTo18Decimals(50).mul(expandTo18Decimals(1)).mul(1000).div(expandTo18Decimals(100).sub(expandTo18Decimals(1)).mul(990)).add(1)
    expect(await router.getAmountIn(expandTo18Decimals(1), expandTo18Decimals(50), expandTo18Decimals(100), false)).to.eq(inFeeCrypto)
    expect(await router.getAmountIn(expandTo18Decimals(1), expandTo18Decimals(50), expandTo18Decimals(100), true)).to.eq(inFeeSec)
  })

  it('getAmountIn', async () => {
    expect(await router.getAmountIn(bigNumberify(1), bigNumberify(100), bigNumberify(100), false)).to.eq(bigNumberify(2))
    await expect(router.getAmountIn(bigNumberify(0), bigNumberify(100), bigNumberify(100), false)).to.be.revertedWith(
      'IxsV2Library: INSUFFICIENT_OUTPUT_AMOUNT'
    )
    await expect(router.getAmountIn(bigNumberify(1), bigNumberify(0), bigNumberify(100), false)).to.be.revertedWith(
      'IxsV2Library: INSUFFICIENT_LIQUIDITY'
    )
    await expect(router.getAmountIn(bigNumberify(1), bigNumberify(100), bigNumberify(0), false)).to.be.revertedWith(
      'IxsV2Library: INSUFFICIENT_LIQUIDITY'
    )
  })

  it('getAmountsOut', async () => {
    await token0.approve(router.address, MaxUint256)
    await token1.approve(router.address, MaxUint256)
    await router.addLiquidity(
      token0.address,
      token1.address,
      bigNumberify(10000),
      bigNumberify(10000),
      0,
      0,
      wallet.address,
      MaxUint256,
      overrides
    )

    await expect(router.getAmountsOut(bigNumberify(2), [token0.address], [false])).to.be.revertedWith(
      'IxsV2Library: INVALID_PATH'
    )
    const path = [token0.address, token1.address]
    const amountsOut = await router.getAmountsOut(bigNumberify(2), path, [false, false])
    expect(amountsOut.map((x: any) => x.toString())).to.deep.eq([bigNumberify(2), bigNumberify(1)].map((x: any) => x.toString()))
  })

  it('getAmountsIn', async () => {
    await token0.approve(router.address, MaxUint256)
    await token1.approve(router.address, MaxUint256)
    await router.addLiquidity(
      token0.address,
      token1.address,
      bigNumberify(10000),
      bigNumberify(10000),
      0,
      0,
      wallet.address,
      MaxUint256,
      overrides
    )

    await expect(router.getAmountsIn(bigNumberify(1), [token0.address], [false])).to.be.revertedWith(
      'IxsV2Library: INVALID_PATH'
    )
    const path = [token0.address, token1.address]
    const amountsIn = await router.getAmountsIn(bigNumberify(1), path, [false, false])
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
  let router: Contract
  let pair: Contract
  beforeEach(async function () {
    const fixture = await loadFixture(v2Fixture)

    WETH = fixture.WETH
    router = fixture.router02

    DTT = await deployContract(wallet, DeflatingERC20, [TOTAL_SUPPLY])

    // make a DTT<>WETH pair
    await fixture.factoryV2.createPair(DTT.address, WETH.address)
    const pairAddress = await fixture.factoryV2.getPair(DTT.address, WETH.address)
    pair = new Contract(pairAddress, JSON.stringify(IIxsV2Pair.abi), provider).connect(wallet)
  })

  afterEach(async function () {
    expect(await provider.getBalance(router.address)).to.eq(0)
  })

  async function addLiquidity(DTTAmount: BigNumber, WETHAmount: BigNumber) {
    await DTT.approve(router.address, MaxUint256)
    await router.addLiquidityETH(DTT.address, DTTAmount, DTTAmount, WETHAmount, wallet.address, MaxUint256, {
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

    await pair.approve(router.address, MaxUint256)
    await router.removeLiquidityETHSupportingFeeOnTransferTokens(
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
      { owner: wallet.address, spender: router.address, value: expectedLiquidity.sub(MINIMUM_LIQUIDITY) },
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

    await pair.approve(router.address, MaxUint256)
    await router.removeLiquidityETHWithPermitSupportingFeeOnTransferTokens(
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
      await DTT.approve(router.address, MaxUint256)

      await router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
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
      await WETH.approve(router.address, MaxUint256)

      await router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
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

    await router.swapExactETHForTokensSupportingFeeOnTransferTokens(
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
    await DTT.approve(router.address, MaxUint256)

    await router.swapExactTokensForETHSupportingFeeOnTransferTokens(
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
  let router: Contract
  let wSecFactory: Contract
  let wsecToken: Contract
  let secPair: Contract
  let token0sec: Contract
  let token1sec: Contract
  let factoryV2: Contract

  beforeEach(async () => {
    const fixture = await loadFixture(v2Fixture)

    router = fixture.router02
    wSecFactory = fixture.wSecFactory
    wsecToken = fixture.wsecToken
    token0sec = fixture.token0sec
    token1sec = fixture.token1sec
    secPair = fixture.secPair
    factoryV2 = fixture.factoryV2

    DTT = await deployContract(wallet, DeflatingERC20, [TOTAL_SUPPLY])
    DTT2 = await deployContract(wallet, DeflatingERC20, [TOTAL_SUPPLY])

    // make a DTT<>WETH pair
    await factoryV2.createPair(DTT.address, DTT2.address)
  })

  afterEach(async function () {
    expect(await provider.getBalance(router.address)).to.eq(0)
  })

  async function addLiquidity(DTTAmount: BigNumber, DTT2Amount: BigNumber) {
    await DTT.approve(router.address, MaxUint256)
    await DTT2.approve(router.address, MaxUint256)
    await router.addLiquidity(
      DTT.address,
      DTT2.address,
      DTTAmount,
      DTT2Amount,
      DTTAmount,
      DTT2Amount,
      wallet.address,
      MaxUint256,
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
      await DTT.approve(router.address, MaxUint256)

      await router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
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

      await token0sec.approve(router.address, MaxUint256)
      await token1sec.approve(router.address, MaxUint256)
      
      await router.addLiquidity(
        token0sec.address,
        token1sec.address,
        SEC0Amount,
        SEC1Amount,
        SEC0Amount,
        SEC1Amount,
        wallet.address,
        MaxUint256,
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
      await ERC.approve(router.address, MaxUint256)

      await router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
        amountIn,
        ZERO_AMOUNT,
        [ERC.address, SEC.address],
        wallet.address,
        deadline,
        wsecToken.address === token0sec.address ? [authorization, EMPTY_SWAP_SIG] : [EMPTY_SWAP_SIG, authorization],
        overrides
      )
    })

    it('SEC -> ERC', async () => {
      await SEC.approve(router.address, MaxUint256)

      await router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
        amountIn,
        ZERO_AMOUNT,
        [SEC.address, ERC.address],
        wallet.address,
        deadline,
        wsecToken.address === token0sec.address ? [authorization, EMPTY_SWAP_SIG] : [EMPTY_SWAP_SIG, authorization],
        overrides
      )
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
      await factoryV2.createPair(DAI.address, WLINK.address)

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

      await DAI.approve(router.address, MaxUint256)
      await WLINK.approve(router.address, MaxUint256)

      await router.addLiquidity(
        DAI.address,
        WLINK.address,
        expandTo18Decimals(30),
        expandTo18Decimals(45),
        0,
        0,
        wallet.address,
        MaxUint256
      )
      
      await router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
        new BigNumber('1000000000000000000'), // 1
        new BigNumber('1410000000000000000'), // 1.41
        [DAI.address, WLINK.address],
        wallet.address,
        deadline,
        [EMPTY_SWAP_SIG, authorization],
        overrides
      )
    })
  })
})
