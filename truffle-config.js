const fs = require('fs');
const path = require('path'); 
const HDWalletProvider = require('@truffle/hdwallet-provider');

function provider(network) {
    if (network == "polygon"){
        return new HDWalletProvider({
            privateKeys: [fs.readFileSync(path.resolve(__dirname, '../.pk')).toString().trim()],
            providerOrUrl: "https://polygon-mainnet.g.alchemy.com/v2/3EdUIIYgKuUEY2Kh6k7u4b6nRJ7Yufa_"
        }); 
    }

    if (network !== 'kovan' && network !== 'mainnet') {
        throw new Error('Allowed network are kovan and mainnet');
    } else if (!fs.existsSync(path.resolve(__dirname, '../.pk'))) {
        throw new Error('Private key file ".pk" does not exist in monorepo root');
    }
    return new HDWalletProvider({
        privateKeys: [fs.readFileSync(path.resolve(__dirname, '../.pk')).toString().trim()],
        providerOrUrl: network === 'kovan'
            ? "wss://kovan.infura.io/ws/v3/7f00ea5349e64a078e7a9533c9126cef"
            : "wss://mainnet.infura.io/ws/v3/7f00ea5349e64a078e7a9533c9126cef",
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
            provider: () => provider('kovan'),
            network_id: 42,
            networkCheckTimeout: 10000000,
            timeoutBlocks: 200,
            skipDryRun: true,
            gasPrice: 10000000000, // 10 gwei
        },
        prod: {
            provider: () => provider('mainnet'),
            network_id: 1,
            networkCheckTimeout: 10000000,
            confirmations: 2,
            timeoutBlocks: 200,
            //skipDryRun: true,
            gasPrice: 100000000000, // 100 gwei (current cost in eth station)
        },
        polygon: {
            provider: () => provider('polygon'),
            network_id: 137,
            networkCheckTimeout: 10000000,
            confirmations: 2,
            timeoutBlocks: 200,
            //skipDryRun: true,
            gasPrice: 46000000000, // 100 gwei (current cost in eth station)
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