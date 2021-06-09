const fs = require('fs');
const path = require('path'); 
const HDWalletProvider = require('@truffle/hdwallet-provider');

function provider(network) {
    if (network !== 'rinkeby' && network !== 'mainnet') {
        throw new Error('Allowed network are rinkeby and mainnet');
    } else if (!fs.existsSync(path.resolve(__dirname, '../.pk'))) {
        throw new Error('Private key file ".pk" does not exist in monorepo root');
    }

    return new HDWalletProvider({
        privateKeys: [fs.readFileSync(path.resolve(__dirname, '../.pk')).toString().trim()],
        providerOrUrl: network === 'rinkeby'
            ? "wss://eth-rinkeby.ws.alchemyapi.io/v2/m2wY2DWOsue-8dYyXINg2iPEkpVn6zPJ"
            : "wss://eth-mainnet.ws.alchemyapi.io/v2/X6G_1zUM08wOu04CKQKXgPLR3gfInY1B",
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
        stage: {
            provider: () => provider('rinkeby'),
            network_id: 4,
            networkCheckTimeout: 10000000,
            timeoutBlocks: 200,  
            skipDryRun: true,
        },
        prod: {
            provider: () => provider('mainnet'),
            network_id: 1,
            networkCheckTimeout: 10000000,
            confirmations: 2,
            timeoutBlocks: 200,  
        },
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