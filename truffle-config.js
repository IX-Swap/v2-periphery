const fs = require('fs');
const path = require('path'); 
const HDWalletProvider = require('@truffle/hdwallet-provider');

function provider(network) {
    if (network !== 'rinkeby' || network !== 'mainnet') {
        throw new Error('Allowed network are rinkeby and mainnet');
    } else if (!fs.existsSync('../.pk')) {
        throw new Error('Private key file ".pk" does not exist in monorepo root');
    }

    return new HDWalletProvider({
        privateKeys: fs.readFileSync('../.pk').toString().trim(),
        providerOrUrl: network === 'rinkeby'
            ? "https://eth-rinkeby.alchemyapi.io/v2/8JFEW-2t5Mg5vLdM03X_bBDs037292vi"
            : "https://eth-mainnet.alchemyapi.io/v2/xn1ulKnMejnDlx6fXs0ev3IeG_F4j_0X",
    });    
}

module.exports = {
    contracts_directory: path.resolve(__dirname, 'contracts'),
    contracts_build_directory: path.resolve(__dirname, 'build'),
    migrations_directory: path.resolve(__dirname, 'migrations'),

    networks: {
        dev: {
            // for WSL use: grep -m 1 nameserver /etc/resolv.conf | awk '{print $2}'
            host: process.env.WSL_HOST || "127.0.0.1", // 172.25.128.1
            port: 8888,
            network_id: "*" // Match any network id
        },
        stage: { provider: () => provider('rinkeby') },
        prod: { provider: () => provider('mainnet') },
    },

    // Configure your compilers
    compilers: {
        solc: {
            version: "0.6.6",
            settings: {
                evmVersion: "istanbul",
                optimizer: {
                    enabled: true,
                    runs: 999999,
                },
            },
        }
    }
};