module.exports = {
    dev: {
        FACTORY_ADDRESS:  '0xA6FC2F48B63dCa48198F6B6a4967e10BcC6963A3', // IXS FactoryV2 deployment address
        TEST: true, // test LP creation
        WETH_ADDRESS: null, // this will be deployed automatically when null
    },
    stage: {
        FACTORY_ADDRESS:  '0x209290A4F4e01affD0AfFc44a11a843534039CF9', // IXS FactoryV2 deployment address
        TEST: true, // test LP creation
        /**
         * DO NOT CHANGE UNLESS YOU KNOW WHAT YOU DO!
         */
        WETH_ADDRESS: '0xc778417E063141139Fce010982780140Aa0cD5Ab', // WETH deployment address (kovan)
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
};
