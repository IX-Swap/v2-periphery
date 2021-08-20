pragma solidity >=0.6.2;

interface IIxsV2Router {
    function factory() external pure returns (address);

    function WETH() external pure returns (address);
}
