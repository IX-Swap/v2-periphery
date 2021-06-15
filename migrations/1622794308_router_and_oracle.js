const DailySlidingWindowOracle01 = artifacts.require('DailySlidingWindowOracle01');
const IxsV2Router02 = artifacts.require('IxsV2Router02');
const IIxsV2Factory = artifacts.require('IIxsV2Factory');
const IIxsV2Pair = artifacts.require('IIxsV2Pair');
const ERC20 = artifacts.require('ERC20');
const WETH9 = artifacts.require('WETH9');
const { FACTORY_ADDRESS, WETH_ADDRESS } = require('../constants');

// trick to be compatible with waffle build
IxsV2Router02._json.contractName = "IxsV2Router02";
IxsV2Router02._properties.contract_name.get = () => "IxsV2Router02";
IxsV2Router02._properties.contractName.get = () => "IxsV2Router02";
IIxsV2Factory._json.contractName = "IIxsV2Factory";
IIxsV2Factory._properties.contract_name.get = () => "IIxsV2Factory";
IIxsV2Factory._properties.contractName.get = () => "IIxsV2Factory";
IIxsV2Pair._json.contractName = "IIxsV2Pair";
IIxsV2Pair._properties.contract_name.get = () => "IIxsV2Pair";
IIxsV2Pair._properties.contractName.get = () => "IIxsV2Pair";
DailySlidingWindowOracle01._json.contractName = "DailySlidingWindowOracle01";
DailySlidingWindowOracle01._properties.contract_name.get = () => "DailySlidingWindowOracle01";
DailySlidingWindowOracle01._properties.contractName.get = () => "DailySlidingWindowOracle01";
ERC20._json.contractName = "ERC20";
ERC20._properties.contract_name.get = () => "ERC20";
ERC20._properties.contractName.get = () => "ERC20";
WETH9._json.contractName = "WETH9";
WETH9._properties.contract_name.get = () => "WETH9";
WETH9._properties.contractName.get = () => "WETH9";

module.exports = async function(deployer, network, accounts) {
  let wethAddress = WETH_ADDRESS;

  if (network === 'dev') {
    await deployer.deploy(WETH9);
    const weth = await WETH9.deployed();
    wethAddress = weth.address;
  }

  console.log('[CFG] FACTORY_ADDRESS', FACTORY_ADDRESS);
  console.log('[CFG] WETH_ADDRESS', wethAddress);

  await deployer.deploy(DailySlidingWindowOracle01, FACTORY_ADDRESS);
  const oracle = await DailySlidingWindowOracle01.deployed();

  console.info('DSW ORACLE =', oracle.address);
  console.info('DSW ORACLE > factory =', await oracle.factory());

  await deployer.deploy(IxsV2Router02, FACTORY_ADDRESS, wethAddress);
  const router = await IxsV2Router02.deployed();

  console.info('ROUTER V2 /02 =', router.address);
  console.info('ROUTER V2 /02 > factory =', await router.factory());
  console.info('ROUTER V2 /02 > WETH =', await router.WETH());

  // Validate deploy....
  if (network === 'dev' || network === 'stage') {
    console.info('');
    console.info('==== VALIDATING DEPLOY! ====');

    const RECEIVER = deployer.networks[network].from;
    const DEADLINE = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
    const TEST_ETH = '10000000000000000'; // 0.01 ETH
    const TEST_SUPPLY = '100000000000000000000'; // 100 TT

    await deployer.deploy(ERC20, TEST_SUPPLY);
    const erc20 = await ERC20.deployed();
    
    console.info('> erc20->approve [ROUTER]');
    await erc20.approve(router.address, TEST_SUPPLY);

    console.info('> router->addLiquidityETH [TT<>WETH9]');
    await router.addLiquidityETH(erc20.address, TEST_SUPPLY, TEST_SUPPLY, TEST_ETH, RECEIVER, DEADLINE, {
      value: TEST_ETH
    });

    console.info('> factory->getPair [TT<>WETH9]');
    const factory = await IIxsV2Factory.at(FACTORY_ADDRESS);
    const pairAddress = await factory.getPair(erc20.address, wethAddress);
    const pair = await IIxsV2Pair.at(pairAddress);

    console.info('> pair->balanceOf [RECEIVER]');
    console.info('LP BENEFICIARY:', RECEIVER);
    console.info('LP TOKENS (wei):', (await pair.balanceOf(RECEIVER)).toString());
  }
};
