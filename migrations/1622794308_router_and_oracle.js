const DailySlidingWindowOracle01 = artifacts.require('DailySlidingWindowOracle01');
const IxsV2LiquidityRouter = artifacts.require('IxsV2LiquidityRouter');
const IxsV2SwapRouter = artifacts.require('IxsV2SwapRouter');
const IIxsV2Factory = artifacts.require('IIxsV2Factory');
const IIxsV2Pair = artifacts.require('IIxsV2Pair');
const ERC20 = artifacts.require('ERC20');
const WETH9 = artifacts.require('WETH9');
const constants = require('../constants');

module.exports = async function(deployer, network, accounts) {
  const { FACTORY_ADDRESS, WETH_ADDRESS, TEST } = constants[network];
  let wethAddress = WETH_ADDRESS;

  console.log('[CFG] FACTORY_ADDRESS', FACTORY_ADDRESS);
  console.log('[CFG] WETH_ADDRESS', wethAddress ?? 'N/A');
  console.log('[CFG] TEST', TEST ? 'YES' : 'NO');

  if (!wethAddress) {
    if (network != 'dev') {
      console.warn("We're about to deploy a new WETH9 instance in a non-development environment! Please avoid this by setting the WETH_ADDRESS.");
    }

    // trick to be compatible with waffle build
    WETH9._json.contractName = "WETH9";
    WETH9._properties.contract_name.get = () => "WETH9";
    WETH9._properties.contractName.get = () => "WETH9";
    await deployer.deploy(WETH9);
    const weth = await WETH9.deployed();
    wethAddress = weth.address;
  }

  // trick to be compatible with waffle build
  DailySlidingWindowOracle01._json.contractName = "DailySlidingWindowOracle01";
  DailySlidingWindowOracle01._properties.contract_name.get = () => "DailySlidingWindowOracle01";
  DailySlidingWindowOracle01._properties.contractName.get = () => "DailySlidingWindowOracle01";
  await deployer.deploy(DailySlidingWindowOracle01, FACTORY_ADDRESS);
  const oracle = await DailySlidingWindowOracle01.deployed();
  const factory = await IIxsV2Factory.at(FACTORY_ADDRESS);

  try {
    await factory.setOracle(oracle.address, '0x0000000000000000000000000000000000000000000000000000000000000000');
  } catch (e) {
    console.warn(
      'FACTORY default oracle allowed to be set once, when missing! ' +
      'Please make sure you did NOT have any failed periphery deploy, otherwise- you need a fresh deploy of core contracts...'
    );
    throw e;
  }

  console.info('DSW ORACLE =', oracle.address);
  console.info('DSW ORACLE > factory =', await oracle.factory());
  console.info('FACTORY V2 > oracle =', await factory.oracle());
  
  // trick to be compatible with waffle build
  IxsV2LiquidityRouter._json.contractName = "IxsV2LiquidityRouter";
  IxsV2LiquidityRouter._properties.contract_name.get = () => "IxsV2LiquidityRouter";
  IxsV2LiquidityRouter._properties.contractName.get = () => "IxsV2LiquidityRouter";
  await deployer.deploy(IxsV2LiquidityRouter, FACTORY_ADDRESS, wethAddress);
  const liquidityRouter = await IxsV2LiquidityRouter.deployed();

  console.info('LIQUIDITY ROUTER V2 =', liquidityRouter.address);
  console.info('LIQUIDITY ROUTER V2 > factory =', await liquidityRouter.factory());
  console.info('LIQUIDITY ROUTER V2 > WETH =', await liquidityRouter.WETH());

  // trick to be compatible with waffle build
  IxsV2SwapRouter._json.contractName = "IxsV2SwapRouter";
  IxsV2SwapRouter._properties.contract_name.get = () => "IxsV2SwapRouter";
  IxsV2SwapRouter._properties.contractName.get = () => "IxsV2SwapRouter";
  await deployer.deploy(IxsV2SwapRouter, FACTORY_ADDRESS, wethAddress);
  const swapRouter = await IxsV2SwapRouter.deployed();

  console.info('SWAP ROUTER V2 =', swapRouter.address);
  console.info('SWAP ROUTER V2 > factory =', await swapRouter.factory());
  console.info('SWAP ROUTER V2 > WETH =', await swapRouter.WETH());

  // Validate deploy....
  if (TEST) {
    if (network == 'prod') {
      console.warn("We're about to run tests on a production environment! Please try to avoid this...");
    }

    console.info('');
    console.info('==== VALIDATING DEPLOY! ====');

    const RECEIVER = deployer.networks[network].from;
    const DEADLINE = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
    const TEST_ETH = '10000000000000000'; // 0.01 ETH
    const TEST_SUPPLY = '100000000000000000000'; // 100 TT

    // trick to be compatible with waffle build
    ERC20._json.contractName = "ERC20";
    ERC20._properties.contract_name.get = () => "ERC20";
    ERC20._properties.contractName.get = () => "ERC20";
    await deployer.deploy(ERC20, TEST_SUPPLY);
    const erc20 = await ERC20.deployed();
    
    console.info('> erc20->approve [ROUTER]');
    await erc20.approve(liquidityRouter.address, TEST_SUPPLY);

    console.info('> liquidityRouter->addLiquidityETH [TT<>WETH9]');
    await liquidityRouter.addLiquidityETH(erc20.address, TEST_SUPPLY, TEST_SUPPLY, TEST_ETH, RECEIVER, DEADLINE, {
      value: TEST_ETH
    });

    console.info('> factory->getPair [TT<>WETH9]');
    const factory = await IIxsV2Factory.at(FACTORY_ADDRESS);
    const pairAddress = await factory.getPair(erc20.address, wethAddress);
    const pair = await IIxsV2Pair.at(pairAddress);

    console.info('> pair->balanceOf [RECEIVER]');
    console.info('');
    console.info('LP BENEFICIARY:', RECEIVER);
    console.info('LP TOKENS (wei):', (await pair.balanceOf(RECEIVER)).toString());
  }
};
