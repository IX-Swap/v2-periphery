pragma solidity >=0.5.16 <=0.6.6;

interface IIxsV2Migrator {
    function migrate(
        address token,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) external;
}
