# router solana contract

## Solana Introduction

[Solana Introduction](https://docs.solana.com/introduction)

[Solana Clusters](https://docs.solana.com/clusters)

[Solana Test Validator](https://docs.solana.com/developing/test-validator)

[Solana JSON RPC API](https://docs.solana.com/developing/clients/jsonrpc-api)

## Anchor Introduction

Anchor is a framework for Solana’s Sealevel runtime providing several convenient developer tools.

[Crate anchor_lang](https://docs.rs/anchor-lang/latest/anchor_lang/index.html)

[@project-serum/anchor](https://project-serum.github.io/anchor/ts/modules/web3.html)

## Install and Config

Reference: [Getting started with Solana and Anchor](https://lorisleiva.com/create-a-solana-dapp-from-scratch/getting-started-with-solana-and-anchor)

* install rust

```shell
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

export PATH="$HOME/.cargo/bin:$PATH"
```

* install solana

```shell
sh -c "$(curl -sSfL https://release.solana.com/v1.8.5/install)"

export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
```

* install anchor

```shell
cargo install --git https://github.com/project-serum/anchor anchor-cli --locked

anchor --version
```

* install yarn

```shell
npm install -g yarn

yarn install
```

* solana config

URL for Solana's JSON RPC `[mainnet-beta, testnet, devnet, localhost]`

```shell
solana config set --url localhost
```

* getnerate key pair

```shell
solana-keygen new

solana address
```

## Run a local ledger

run a local ledger for development and testing.

```shell
# Check you can run a local validator (Run Ctrl+C to exit).
# Note this creates a "test-ledger" folder in your current directory.
solana-test-validator

# Or, run a new empty local ledger.
solana-test-validator --reset
```

## First Time Build

```shell
anchor build
```

Once our code was compiled, the `target` folder was updated accordingly.

The `target` folder basically keeps track of any built releases and deployment of our program.

Especially

`target/deploy`
> The first time you build a program, it will also generate a public and private key for it — which will be stored in the `target/deploy` directory. The public key generated will become the unique identifier of your program (the program ID).
> It also inclue a `.so` file which is the compiled `BPF` program.

`target/idl`
> simply a JSON file that contains all the specifications of our Solana program

## Update program ID

We can access our program ID by using the following Solana command.

```shell
solana address -k target/deploy/router-keypair.json
# Outputs something like: 5F3j1TvB7CQa4XRFN48iAd8y2ZgXXzUTVMJvtFXvF4N
```

Okay now that we know our program ID, let's update it.

First, in our `Anchor.toml` configuration file.

```toml
[programs.localnet]
router = "5F3j1TvB7CQa4XRFN48iAd8y2ZgXXzUTVMJvtFXvF4N"
```

Then, in the lib.rs file of our Solana program.
that's `programs/router/src/lib.rs`.

```rust
declare_id!("5F3j1TvB7CQa4XRFN48iAd8y2ZgXXzUTVMJvtFXvF4N");
```

## Build

```shell
anchor build
```

## Test

```shell
anchor test
```

## Deploy

```shell
anchor deploy
```
