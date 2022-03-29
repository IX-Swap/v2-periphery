module.exports = {
    dev: {
        FACTORY_ADDRESS:  '', // IXS FactoryV2 deployment address
        TEST: true, // test LP creation
        WETH_ADDRESS: null, // this will be deployed automatically when null
    },
    stage: {
        FACTORY_ADDRESS:  '0x4983b160a8E0De9Cf6a055bd8750847DE3E14eE6', // IXS FactoryV2 deployment address
        TEST: true, // test LP creation
        /**
         * DO NOT CHANGE UNLESS YOU KNOW WHAT YOU DO!
         */
        WETH_ADDRESS: '0xd0a1e359811322d97991e03f863a0c30c2cf029c', // WETH deployment address (kovan)
        // for WETH9 known implementations consult: sdk-core/src/entities/weth9.ts
        // should be the same as: subgraph/src/mappings/pricing.ts (WETH_ADDRESS)
    },
    prod: {
        FACTORY_ADDRESS:  '', // IXS FactoryV2 deployment address
        TEST: false, // test LP creation
        /**
         * DO NOT CHANGE UNLESS YOU KNOW WHAT YOU DO!
         */
        WETH_ADDRESS: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH deployment address (mainnet)
        // for WETH9 known implementations consult: sdk-core/src/entities/weth9.ts
        // should be the same as: subgraph/src/mappings/pricing.ts (WETH_ADDRESS)
    },
    polygon: {
        FACTORY_ADDRESS:  '0xc2D0e0bc81494adB71Ce9Aa350cC875DaE12D81D', // IXS FactoryV2 deployment address
        TEST: true, // test LP creation
        /**
         * DO NOT CHANGE UNLESS YOU KNOW WHAT YOU DO!
         */
        WETH_ADDRESS: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', // WMATIC deployment address (mainnet)
        // for WETH9 known implementations consult: sdk-core/src/entities/weth9.ts
        // should be the same as: subgraph/src/mappings/pricing.ts (WETH_ADDRESS)
    },
};
