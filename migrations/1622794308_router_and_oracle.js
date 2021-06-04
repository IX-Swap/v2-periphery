const DailySlidingWindowOracle01 = artifacts.require('DailySlidingWindowOracle01');
const IxsV2Router02 = artifacts.require('IxsV2Router02');
const WETH9 = artifacts.require('WETH9');
const { FACTORY_ADDRESS, WETH_ADDRESS } = require('../constants');

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
};
