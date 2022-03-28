module.exports = {
    dev: {
        FACTORY_ADDRESS:  '', // IXS FactoryV2 deployment address
        TEST: true, // test LP creation
        WETH_ADDRESS: null, // this will be deployed automatically when null
    },
    stage: {
        FACTORY_ADDRESS:  '0x38DE403C0c289D37B0A3b554E0048eF2A1fBE592', // IXS FactoryV2 deployment address
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
};
