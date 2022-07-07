const assert = require("assert");
const util = require('util');
const anchor = require("@project-serum/anchor");
const fs = require("fs");
const { SystemProgram, PublicKey, Keypair, Transaction, LAMPORTS_PER_SOL, SYSVAR_RENT_PUBKEY } = anchor.web3;
const spl = require("@solana/spl-token");
const { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, Token } = spl;
const { Command } = require('commander');
const program = new Command();
var router_program
var connection
var mywallet

var printTx = async (tx) => {
    await connection.confirmTransaction(tx)
    let txresult = await connection.getParsedConfirmedTransaction(tx, "confirmed");
    console.log("tx result is")
    //console.log(JSON.stringify(txresult, null, 4));
    console.log(util.inspect(txresult, { showHidden: false, depth: null, colors: true }));
}

async function init() {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    connection = provider.connection;

    router_program = anchor.workspace.Router;
    console.log("program", router_program.programId.toBase58())

    mywallet = provider.wallet;
    console.log("my wallet is", mywallet.publicKey.toString());
}

program.version('0.0.1');
program.command('swapout-native')
    .requiredOption('-t --to <to>', 'to address')
    .requiredOption('-a --amount <amount>', 'to address')
    .requiredOption('-c --chainid <chainid>', 'to chainid')
    .requiredOption('-o --owner <owner>', 'router owner account')
    .action(function () {
        console.log("options", this.opts())
        console.log('solana node', process.env.ANCHOR_PROVIDER_URL);
        console.log('solana wallet', process.env.ANCHOR_WALLET);
        init().then(async () => {
            const tx = await router_program.rpc.swapoutNative(
                this.opts().to,
                new anchor.BN(this.opts().amount),
                new anchor.BN(this.opts().chainid), {
                accounts: {
                    signer: mywallet.publicKey,
                    routerAccount: new PublicKey(this.opts().owner),
                    systemProgram: SystemProgram.programId,
                },
                signers: [mywallet.payer],
            });
            console.log("swapoutNative tx is", tx);
            await printTx(tx);
        });
    }).on('--help', function () {
        console.log('Examples:');
        console.log();
        console.log('ANCHOR_PROVIDER_URL=http://localhost:8899 ANCHOR_WALLET=/Users/potti/.config/solana/id.json node app/client.js swapout-native -a 1000000000 -c 5777 -t 0xC5107334A3Ae117E3DaD3570b419618C905Aa5eC -o GdkWDfbwCe9KE8JB9JWLvYnXpgcYiReB7DTfeqvZaxgW');
    });


program.command('swapout-burn')
    .requiredOption('-t --to <to>', 'to address')
    .requiredOption('-a --amount <amount>', 'to address')
    .requiredOption('-c --chainid <chainid>', 'to chainid')
    .requiredOption('-o --owner <owner>', 'router owner account')
    .requiredOption('-token --token <programID>', 'token programID')
    .requiredOption('-f --from <from>', 'swapout address')
    .action(function () {
        console.log('solana node', process.env.ANCHOR_PROVIDER_URL);
        console.log('solana wallet', process.env.ANCHOR_WALLET);
        console.log("options", this.opts())

        _routerAccount = new PublicKey(options.args[3])
        _tempMintA = new PublicKey(options.args[4])
        _fromATA = new PublicKey(options.args[5])
        init().then(async () => {
            const tx = await router_program.rpc.swapoutBurn(
                options.args[0],
                new anchor.BN(options.args[1]),
                new anchor.BN(options.args[2]), {
                accounts: {
                    signer: mywallet.publicKey,
                    routerAccount: _routerAccount,
                    from: _fromATA,
                    mint: _tempMintA,
                    tokenProgram: TOKEN_PROGRAM_ID
                },
                signers: [mywallet.payer],
            });
            console.log("swapoutBurn tx is", tx);
            await printTx(tx);
        });
    }).on('--help', function () {
        console.log('Examples:');
        console.log();
        console.log('ANCHOR_PROVIDER_URL=http://localhost:8899 ANCHOR_WALLET=/Users/potti/.config/solana/id.json node app/client.js swapout-burn -a 1000000000 -c 5777 -t 0xC5107334A3Ae117E3DaD3570b419618C905Aa5eC -o GdkWDfbwCe9KE8JB9JWLvYnXpgcYiReB7DTfeqvZaxgW -token 5YpahJbiAhguVzTjhSs7f8Wkbj4LnzoughYr5Mth5b15 -f 3gScJGwn2GKoi8xjNoSDP6pb9qsnNVAXciWSv7E8yUt5');
    });

program.command('swapout-transfer')
    .requiredOption('-t --to <string>', 'to address')
    .requiredOption('-a --amount <number>', 'to address')
    .requiredOption('-c --chainid <string>', 'to chainid')
    .requiredOption('-o --owner <string>', 'router owner account')
    .requiredOption('-token --token <string>', 'token programID')
    .requiredOption('-f --from <string>', 'swapout address')
    .action(function () {
        console.log('solana node', process.env.ANCHOR_PROVIDER_URL);
        console.log('solana wallet', process.env.ANCHOR_WALLET);
        console.log("options", this.opts())
        init().then(async () => {
            _routerAccount = new PublicKey(this.opts().owner)
            _tempMintA = new PublicKey(this.opts().token)
            _fromATA = new PublicKey(this.opts().from)
            _routerAccountA = await Token.getAssociatedTokenAddress(ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, _tempMintA, _routerAccount, true);
            const tx = await router_program.rpc.swapoutTransfer(
                this.opts().to,
                new anchor.BN(this.opts().amount),
                new anchor.BN(this.opts().chainid), {
                accounts: {
                    signer: mywallet.publicKey,
                    routerAccount: _routerAccount,
                    from: _fromATA,
                    to: _routerAccountA,
                    mint: _tempMintA,
                    tokenProgram: TOKEN_PROGRAM_ID
                },
                signers: [mywallet.payer],
            });
            console.log("swapoutTransfer tx is", tx);
            await printTx(tx);
        });
    }).on('--help', function () {
        console.log('Examples:');
        console.log();
        console.log('ANCHOR_PROVIDER_URL=http://localhost:8899 ANCHOR_WALLET=/Users/potti/.config/solana/id.json node app/client.js swapout-transfer -c 5777 -t 0xC5107334A3Ae117E3DaD3570b419618C905Aa5eC -o GdkWDfbwCe9KE8JB9JWLvYnXpgcYiReB7DTfeqvZaxgW -token Fk34CvukAYauMFFD6epAYYKLLrN2XRXabnaBANhvJ4a1 -f DCPQftdPB6CbZUaBNpxcFYhX3dZHzQNVTtAubkV4scuc -a 1000000000');
    });

program.command('mint')
    .requiredOption('-token --token <programID>', 'token programID')
    .requiredOption('-owner --owner <programID>', 'token owner')
    .requiredOption('-t --to <ata>', 'transfer to ata address')
    .requiredOption('-a --amount <number>', 'amount')
    .action(function () {
        console.log('solana node', process.env.ANCHOR_PROVIDER_URL);
        console.log('solana wallet', process.env.ANCHOR_WALLET);
        console.log("options", this.opts())

        init().then(async () => {
            _tempMintA = new PublicKey(this.opts().token)
            _owner = new PublicKey(this.opts().owner)
            _toATA = new PublicKey(this.opts().to)
            const token = new Token(connection, _tempMintA, TOKEN_PROGRAM_ID, mywallet.payer);
            await token.mintTo(
                _toATA,
                _owner,
                [mywallet.payer],
                this.opts().amount
            )
            let tokenAmount = await connection.getTokenAccountBalance(_toATA);
            console.log("toATA balance is", tokenAmount);
        });
    }).on('--help', function () {
        console.log('Examples:');
        console.log();
        console.log('ANCHOR_PROVIDER_URL=http://localhost:8899 ANCHOR_WALLET=/Users/potti/.config/solana/id.json node app/client.js mint -token Fk34CvukAYauMFFD6epAYYKLLrN2XRXabnaBANhvJ4a1 -owner 3gScJGwn2GKoi8xjNoSDP6pb9qsnNVAXciWSv7E8yUt5 -t DCPQftdPB6CbZUaBNpxcFYhX3dZHzQNVTtAubkV4scuc -a 10000000000000 ');
    });

program.parse(process.argv);


