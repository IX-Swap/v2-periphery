import { Contract } from 'ethers'
import { Web3Provider } from 'ethers/providers'
import { BigNumber, bigNumberify, getAddress, keccak256, defaultAbiCoder, toUtf8Bytes, solidityPack, formatBytes32String } from 'ethers/utils'
import { AddressZero, MaxUint256 } from 'ethers/constants'

export const MINIMUM_LIQUIDITY = bigNumberify(10).pow(3)

const PERMIT_TYPEHASH = keccak256(
  toUtf8Bytes('Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)')
)

const AUTHORIZE_SWAP_TYPEHASH = keccak256(
  toUtf8Bytes('AuthorizeSwap(address operator,address spender,uint256 nonce,uint256 deadline)')
)

export interface SecAuthorization {
  operator: string;
  deadline: string | BigNumber | number;
  v: string | BigNumber | number;
  r: string;
  s: string;
}

export const EMPTY_SWAP_SIG: SecAuthorization = {
  operator: AddressZero,
  deadline: MaxUint256,
  v: 0,
  r: formatBytes32String(''),
  s: formatBytes32String(''),
}

export const EMPTY_SWAP_DIGEST = [EMPTY_SWAP_SIG, EMPTY_SWAP_SIG];

export function expandTo18Decimals(n: number): BigNumber {
  return bigNumberify(n).mul(bigNumberify(10).pow(18))
}

function getWSecDomainSeparator(name: string, symbol: string, tokenAddress: string) {
  return keccak256(
    defaultAbiCoder.encode(
      ['bytes32', 'bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
      [
        keccak256(toUtf8Bytes('EIP712Domain(string name,string symbol,string version,uint256 chainId,address verifyingContract)')),
        keccak256(toUtf8Bytes(name)),
        keccak256(toUtf8Bytes(symbol)),
        keccak256(toUtf8Bytes('1')),
        1,
        tokenAddress
      ]
    )
  )
}

export function getWSecCreate2Salt(
  name: string,
  symbol: string,
  decimals: number
): string {
  return keccak256(defaultAbiCoder.encode(
    ['bytes32', 'bytes32', 'uint8'],
    [keccak256(toUtf8Bytes(name)), keccak256(toUtf8Bytes(symbol)), decimals]
  ))
}

export function getWSecCreate2Address(
  wSecFactoryAddress: string,
  token: { name: string, symbol: string, decimals: number },
  bytecode: string
): string {
  const salt = getWSecCreate2Salt(token.name, token.symbol, token.decimals)
  const create2Inputs = [
    '0xff',
    wSecFactoryAddress,
    salt,
    keccak256(bytecode)
  ]

  const sanitizedInputs = `0x${create2Inputs.map(i => i.slice(2)).join('')}`
  return getAddress(`0x${keccak256(sanitizedInputs).slice(-40)}`)
}

function getDomainSeparator(name: string, tokenAddress: string) {
  return keccak256(
    defaultAbiCoder.encode(
      ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
      [
        keccak256(toUtf8Bytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')),
        keccak256(toUtf8Bytes(name)),
        keccak256(toUtf8Bytes('1')),
        1,
        tokenAddress
      ]
    )
  )
}

export async function getSwapDigest(
  token: Contract,
  approve: {
    operator: string
    spender: string
  },
  nonce: BigNumber,
  deadline: BigNumber
): Promise<string> {
  const name = await token.name()
  const symbol = await token.symbol()
  const DOMAIN_SEPARATOR = getWSecDomainSeparator(name, symbol, token.address)

  return keccak256(
    solidityPack(
      ['bytes1', 'bytes1', 'bytes32', 'bytes32'],
      [
        '0x19',
        '0x01',
        DOMAIN_SEPARATOR,
        keccak256(
          defaultAbiCoder.encode(
            ['bytes32', 'address', 'address', 'uint256', 'uint256'],
            [AUTHORIZE_SWAP_TYPEHASH, approve.operator, approve.spender, nonce, deadline]
          )
        )
      ]
    )
  )
}

export async function getWSecApprovalDigest(
  token: Contract,
  approve: {
    owner: string
    spender: string
    value: BigNumber
  },
  nonce: BigNumber,
  deadline: BigNumber
): Promise<string> {
  const name = await token.name()
  const symbol = await token.symbol()
  const DOMAIN_SEPARATOR = getWSecDomainSeparator(name, symbol, token.address)
  return keccak256(
    solidityPack(
      ['bytes1', 'bytes1', 'bytes32', 'bytes32'],
      [
        '0x19',
        '0x01',
        DOMAIN_SEPARATOR,
        keccak256(
          defaultAbiCoder.encode(
            ['bytes32', 'address', 'address', 'uint256', 'uint256', 'uint256'],
            [PERMIT_TYPEHASH, approve.owner, approve.spender, approve.value, nonce, deadline]
          )
        )
      ]
    )
  )
}

export async function getApprovalDigest(
  token: Contract,
  approve: {
    owner: string
    spender: string
    value: BigNumber
  },
  nonce: BigNumber,
  deadline: BigNumber
): Promise<string> {
  const name = await token.name()
  const DOMAIN_SEPARATOR = getDomainSeparator(name, token.address)
  return keccak256(
    solidityPack(
      ['bytes1', 'bytes1', 'bytes32', 'bytes32'],
      [
        '0x19',
        '0x01',
        DOMAIN_SEPARATOR,
        keccak256(
          defaultAbiCoder.encode(
            ['bytes32', 'address', 'address', 'uint256', 'uint256', 'uint256'],
            [PERMIT_TYPEHASH, approve.owner, approve.spender, approve.value, nonce, deadline]
          )
        )
      ]
    )
  )
}

export async function mineBlock(provider: Web3Provider, timestamp: number): Promise<void> {
  await new Promise(async (resolve, reject) => {
    ; (provider._web3Provider.sendAsync as any)(
      { jsonrpc: '2.0', method: 'evm_mine', params: [timestamp] },
      (error: any, result: any): void => {
        if (error) {
          reject(error)
        } else {
          resolve(result)
        }
      }
    )
  })
}

export function encodePrice(reserve0: BigNumber, reserve1: BigNumber) {
  return [reserve1.mul(bigNumberify(2).pow(112)).div(reserve0), reserve0.mul(bigNumberify(2).pow(112)).div(reserve1)]
}
