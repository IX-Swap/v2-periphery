pragma solidity >=0.5.0;

interface IIxsV1Factory {
    function getExchange(address) external view returns (address);
}
