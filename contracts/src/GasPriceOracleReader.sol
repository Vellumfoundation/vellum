// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IGasPriceOracle {
    function gasPrice() external view returns (uint256);
    function baseFee() external view returns (uint256);
    function overhead() external view returns (uint256);
    function scalar() external view returns (uint256);
}

contract GasPriceOracleReader {
    address public constant GAS_PRICE_ORACLE = 0x420000000000000000000000000000000000000F;

    function readGasPrice() external view returns (uint256) {
        return IGasPriceOracle(GAS_PRICE_ORACLE).gasPrice();
    }

    function readBaseFee() external view returns (uint256) {
        return IGasPriceOracle(GAS_PRICE_ORACLE).baseFee();
    }

    function readLegacyFeeParameters() external view returns (uint256 overhead, uint256 scalar) {
        overhead = IGasPriceOracle(GAS_PRICE_ORACLE).overhead();
        scalar = IGasPriceOracle(GAS_PRICE_ORACLE).scalar();
    }
}
