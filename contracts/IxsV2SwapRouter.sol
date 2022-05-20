pragma solidity =0.6.6;
pragma experimental ABIEncoderV2;

import '@ixswap1/v2-core/contracts/interfaces/IIxsV2Pair.sol';
import '@ixswap1/v2-core/contracts/interfaces/IIxsV2Factory.sol';
import '@ixswap1/lib/contracts/libraries/TransferHelper.sol';

import './interfaces/IIxsV2Router.sol';
import './interfaces/IIxsV2SwapRouter.sol';
import './libraries/IxsV2Library.sol';
import './libraries/SafeMath.sol';
import './interfaces/IERC20.sol';
import './interfaces/IWETH.sol';

contract IxsV2SwapRouter is IIxsV2SwapRouter, IIxsV2Router {
    using SafeMath for uint256;

    address public immutable override factory;
    address public immutable override WETH;

    modifier ensure(uint256 deadline) {
        require(deadline >= block.timestamp, 'IxsV2Router: EXPIRED');
        _;
    }

    constructor(address _factory, address _WETH) public {
        factory = _factory;
        WETH = _WETH;
    }

    receive() external payable {
        assert(msg.sender == WETH); // only accept ETH via fallback from the WETH contract
    }

    // **** SWAP ****
    // requires the initial amount to have already been sent to the first pair
    function _swap(
        uint256[] memory amounts,
        address[] memory path,
        address _to,
        IIxsV2Pair.SecAuthorization[] memory authorizations
    ) internal virtual {
        for (uint256 i; i < path.length - 1; i++) {
            (address input, address output) = (path[i], path[i + 1]);
            (address token0, ) = IxsV2Library.sortTokens(input, output);
            uint256 amountOut = amounts[i + 1];
            (uint256 amount0Out, uint256 amount1Out) = input == token0
                ? (uint256(0), amountOut)
                : (amountOut, uint256(0));
            address to = i < path.length - 2 ? IxsV2Library.pairFor(factory, output, path[i + 2]) : _to;

            {
                // avoid stack to deep error
                address _input = input;
                (
                    IIxsV2Pair.SecAuthorization memory authorizationA,
                    IIxsV2Pair.SecAuthorization memory authorizationB
                ) = (authorizations[i], authorizations[i + 1]);
                IIxsV2Pair(IxsV2Library.pairFor(factory, _input, output)).swap(
                    amount0Out,
                    amount1Out,
                    to,
                    new bytes(0),
                    _authStruct2ArrayToDynamic(
                        _input == token0
                            ? [authorizationA, authorizationB]
                            : [authorizationB, authorizationA]
                    )
                );
            }
        }
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline,
        IIxsV2Pair.SecAuthorization[] calldata authorizations
    ) external virtual override ensure(deadline) returns (uint256[] memory amounts) {
        IIxsV2Pair pair = IIxsV2Pair(IxsV2Library.pairFor(factory, path[0], path[1]));
        {
            // avoid stack to deep error
            address[] memory _path = path;
            uint256 _amountIn = amountIn;
            amounts = IxsV2Library.getAmountsOut(
                factory,
                _amountIn,
                _path
            );
            require(amounts[amounts.length - 1] >= amountOutMin, 'IxsV2Router: INSUFFICIENT_OUTPUT_AMOUNT');
        }
        TransferHelper.safeTransferFrom(path[0], msg.sender, address(pair), amounts[0]);
        _swap(amounts, path, to, authorizations);
    }

    function swapTokensForExactTokens(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline,
        IIxsV2Pair.SecAuthorization[] calldata authorizations
    ) external virtual override ensure(deadline) returns (uint256[] memory amounts) {
        IIxsV2Pair pair = IIxsV2Pair(IxsV2Library.pairFor(factory, path[0], path[1]));
        {
            // avoid stack to deep error
            address[] memory _path = path;
            uint256 _amountOut = amountOut;
            amounts = IxsV2Library.getAmountsIn(
                factory,
                _amountOut,
                _path
            );
            require(amounts[0] <= amountInMax, 'IxsV2Router: EXCESSIVE_INPUT_AMOUNT');
        }
        TransferHelper.safeTransferFrom(path[0], msg.sender, address(pair), amounts[0]);
        _swap(amounts, path, to, authorizations);
    }

    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline,
        IIxsV2Pair.SecAuthorization[] calldata authorizations
    ) external payable virtual override ensure(deadline) returns (uint256[] memory amounts) {
        require(path[0] == WETH, 'IxsV2Router: INVALID_PATH');
        IIxsV2Pair pair = IIxsV2Pair(IxsV2Library.pairFor(factory, path[0], path[1]));
        {
            // avoid stack to deep error
            address[] memory _path = path;
            amounts = IxsV2Library.getAmountsOut(
                factory,
                msg.value,
                _path
            );
            require(amounts[amounts.length - 1] >= amountOutMin, 'IxsV2Router: INSUFFICIENT_OUTPUT_AMOUNT');
        }
        IWETH(WETH).deposit{value: amounts[0]}();
        assert(IWETH(WETH).transfer(address(pair), amounts[0]));
        _swap(amounts, path, to, authorizations);
    }

    function swapTokensForExactETH(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline,
        IIxsV2Pair.SecAuthorization[] calldata authorizations
    ) external virtual override ensure(deadline) returns (uint256[] memory amounts) {
        require(path[path.length - 1] == WETH, 'IxsV2Router: INVALID_PATH');
        IIxsV2Pair pair = IIxsV2Pair(IxsV2Library.pairFor(factory, path[0], path[1]));
        {
            // avoid stack to deep error
            address[] memory _path = path;
            uint256 _amountOut = amountOut;
            amounts = IxsV2Library.getAmountsIn(
                factory,
                _amountOut,
                _path
            );
            require(amounts[0] <= amountInMax, 'IxsV2Router: EXCESSIVE_INPUT_AMOUNT');
        }
        TransferHelper.safeTransferFrom(path[0], msg.sender, address(pair), amounts[0]);
        _swap(amounts, path, address(this), authorizations);
        IWETH(WETH).withdraw(amounts[amounts.length - 1]);
        TransferHelper.safeTransferETH(to, amounts[amounts.length - 1]);
    }

    function swapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline,
        IIxsV2Pair.SecAuthorization[] calldata authorizations
    ) external virtual override ensure(deadline) returns (uint256[] memory amounts) {
        require(path[path.length - 1] == WETH, 'IxsV2Router: INVALID_PATH');
        IIxsV2Pair pair = IIxsV2Pair(IxsV2Library.pairFor(factory, path[0], path[1]));
        {
            // avoid stack to deep error
            address[] memory _path = path;
            uint256 _amountIn = amountIn;
            amounts = IxsV2Library.getAmountsOut(
                factory,
                _amountIn,
                _path
            );
            require(amounts[amounts.length - 1] >= amountOutMin, 'IxsV2Router: INSUFFICIENT_OUTPUT_AMOUNT');
        }
        TransferHelper.safeTransferFrom(path[0], msg.sender, address(pair), amounts[0]);
        _swap(amounts, path, address(this), authorizations);
        IWETH(WETH).withdraw(amounts[amounts.length - 1]);
        TransferHelper.safeTransferETH(to, amounts[amounts.length - 1]);
    }

    function swapETHForExactTokens(
        uint256 amountOut,
        address[] calldata path,
        address to,
        uint256 deadline,
        IIxsV2Pair.SecAuthorization[] calldata authorizations
    ) external payable virtual override ensure(deadline) returns (uint256[] memory amounts) {
        require(path[0] == WETH, 'IxsV2Router: INVALID_PATH');
        IIxsV2Pair pair = IIxsV2Pair(IxsV2Library.pairFor(factory, path[0], path[1]));
        {
            // avoid stack to deep error
            address[] memory _path = path;
            uint256 _amountOut = amountOut;
            amounts = IxsV2Library.getAmountsIn(
                factory,
                _amountOut,
                _path
            );
            require(amounts[0] <= msg.value, 'IxsV2Router: EXCESSIVE_INPUT_AMOUNT');
        }
        IWETH(WETH).deposit{value: amounts[0]}();
        assert(IWETH(WETH).transfer(address(pair), amounts[0]));
        _swap(amounts, path, to, authorizations);
        // refund dust eth, if any
        if (msg.value > amounts[0]) TransferHelper.safeTransferETH(msg.sender, msg.value - amounts[0]);
    }

    // **** SWAP (supporting fee-on-transfer tokens) ****
    // requires the initial amount to have already been sent to the first pair
    function _swapSupportingFeeOnTransferTokens(
        address[] memory path,
        address _to,
        IIxsV2Pair.SecAuthorization[] memory authorizations
    ) internal virtual {
        for (uint256 i; i < path.length - 1; i++) {
            IIxsV2Pair pair = IIxsV2Pair(IxsV2Library.pairFor(factory, path[i], path[i + 1]));

            uint256 amountInput;
            uint256 amountOutput;
            {
                // scope to avoid stack too deep errors
                (address input, address output) = (path[i], path[i + 1]);
                (address token0, ) = IxsV2Library.sortTokens(input, output);
                (uint256 reserve0, uint256 reserve1, ) = pair.getReserves();
                (uint256 reserveInput, uint256 reserveOutput) = input == token0
                    ? (reserve0, reserve1)
                    : (reserve1, reserve0);
                amountInput = IERC20(input).balanceOf(address(pair)).sub(reserveInput);
                amountOutput = IxsV2Library.getAmountOut(
                    amountInput,
                    reserveInput,
                    reserveOutput,
                    pair.isSecurityPool()
                );
            }

            uint256 amount0Out;
            uint256 amount1Out;
            IIxsV2Pair.SecAuthorization[] memory sortedAuthorizations;
            {
                // scope to avoid stack too deep errors
                address[] memory _path = path;
                IIxsV2Pair.SecAuthorization[] memory _authorizations = authorizations;
                (
                    IIxsV2Pair.SecAuthorization memory authorizationA,
                    IIxsV2Pair.SecAuthorization memory authorizationB
                ) = (_authorizations[i], _authorizations[i + 1]);
                (address input, address output) = (_path[i], _path[i + 1]);
                (address token0, ) = IxsV2Library.sortTokens(input, output);
                (amount0Out, amount1Out) = input == token0 ? (uint256(0), amountOutput) : (amountOutput, uint256(0));
                sortedAuthorizations = _authStruct2ArrayToDynamic(
                    input == token0
                        ? [authorizationA, authorizationB]
                        : [authorizationB, authorizationA]
                );
            }

            {
                // scope to avoid stack too deep errors
                address[] memory _path = path;
                pair.swap(
                    amount0Out,
                    amount1Out,
                    i < _path.length - 2 ? IxsV2Library.pairFor(factory, _path[i + 1], _path[i + 2]) : _to, // to
                    new bytes(0),
                    sortedAuthorizations
                );
            }
        }
    }

    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline,
        IIxsV2Pair.SecAuthorization[] calldata authorizations
    ) external virtual override ensure(deadline) {
        TransferHelper.safeTransferFrom(path[0], msg.sender, IxsV2Library.pairFor(factory, path[0], path[1]), amountIn);
        uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(to);
        _swapSupportingFeeOnTransferTokens(path, to, authorizations);
        require(
            IERC20(path[path.length - 1]).balanceOf(to).sub(balanceBefore) >= amountOutMin,
            'IxsV2Router: INSUFFICIENT_OUTPUT_AMOUNT'
        );
    }

    function swapExactETHForTokensSupportingFeeOnTransferTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline,
        IIxsV2Pair.SecAuthorization[] calldata authorizations
    ) external payable virtual override ensure(deadline) {
        require(path[0] == WETH, 'IxsV2Router: INVALID_PATH');
        uint256 amountIn = msg.value;
        IWETH(WETH).deposit{value: amountIn}();
        assert(IWETH(WETH).transfer(IxsV2Library.pairFor(factory, path[0], path[1]), amountIn));
        uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(to);
        _swapSupportingFeeOnTransferTokens(path, to, authorizations);
        require(
            IERC20(path[path.length - 1]).balanceOf(to).sub(balanceBefore) >= amountOutMin,
            'IxsV2Router: INSUFFICIENT_OUTPUT_AMOUNT'
        );
    }

    function swapExactTokensForETHSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline,
        IIxsV2Pair.SecAuthorization[] calldata authorizations
    ) external virtual override ensure(deadline) {
        require(path[path.length - 1] == WETH, 'IxsV2Router: INVALID_PATH');
        TransferHelper.safeTransferFrom(path[0], msg.sender, IxsV2Library.pairFor(factory, path[0], path[1]), amountIn);
        _swapSupportingFeeOnTransferTokens(path, address(this), authorizations);
        uint256 amountOut = IERC20(WETH).balanceOf(address(this));
        require(amountOut >= amountOutMin, 'IxsV2Router: INSUFFICIENT_OUTPUT_AMOUNT');
        IWETH(WETH).withdraw(amountOut);
        TransferHelper.safeTransferETH(to, amountOut);
    }

    // **** LIBRARY FUNCTIONS ****
    function quote(
        uint256 amountA,
        uint256 reserveA,
        uint256 reserveB
    ) public pure virtual override returns (uint256 amountB) {
        return IxsV2Library.quote(amountA, reserveA, reserveB);
    }

    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut,
        bool isSecurityPool
    ) public pure virtual override returns (uint256 amountOut) {
        return IxsV2Library.getAmountOut(amountIn, reserveIn, reserveOut, isSecurityPool);
    }

    function getAmountIn(
        uint256 amountOut,
        uint256 reserveIn,
        uint256 reserveOut,
        bool isSecurityPool
    ) public pure virtual override returns (uint256 amountIn) {
        return IxsV2Library.getAmountIn(amountOut, reserveIn, reserveOut, isSecurityPool);
    }

    function getAmountsOut(
        uint256 amountIn,
        address[] memory path
    ) public view virtual override returns (uint256[] memory amounts) {
        return IxsV2Library.getAmountsOut(factory, amountIn, path);
    }

    function getAmountsIn(
        uint256 amountOut,
        address[] memory path
    ) public view virtual override returns (uint256[] memory amounts) {
        return IxsV2Library.getAmountsIn(factory, amountOut, path);
    }

    function _authStruct2ArrayToDynamic(IIxsV2Pair.SecAuthorization[2] memory arr)
        internal
        pure
        returns (IIxsV2Pair.SecAuthorization[] memory dynarr)
    {
        dynarr = new IIxsV2Pair.SecAuthorization[](2);
        dynarr[0] = arr[0];
        dynarr[1] = arr[1];
    }
}
