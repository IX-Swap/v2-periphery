require("@nomiclabs/hardhat-waffle");
require("hardhat-gas-reporter");

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async () => {
  const accounts = await ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  paths: {
    tests: "./test",
    sources: "./contracts",
    artifacts: "./build",
  },
  solidity: {
    version: "0.5.16",
    settings: {
      evmVersion: "istanbul",
      optimizer: {
        enabled: true,
        runs: 999999,
      },
    },
  },
  defaultNetwork: "rinkeby",
  networks: {
    hardhat: {
      forking: {
        url: "https://eth-mainnet.alchemyapi.io/v2/xn1ulKnMejnDlx6fXs0ev3IeG_F4j_0X",
      },
    },
    rinkeby: {
      url: "https://eth-rinkeby.alchemyapi.io/v2/8JFEW-2t5Mg5vLdM03X_bBDs037292vi",
      accounts: [process.env.WALLET],
    },
  },
};
