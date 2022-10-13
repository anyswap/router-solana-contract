const fs = require('fs');
const util = require('util');
const assert = require("assert");
const anchor = require("@project-serum/anchor");
const { SystemProgram, PublicKey, Keypair, Transaction, LAMPORTS_PER_SOL, SYSVAR_RENT_PUBKEY } = anchor.web3;
const spl = require("@solana/spl-token");
const { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, Token } = spl;

var connection;
var printTx = async (tx) => {
  await connection.confirmTransaction(tx)
  let txresult = await connection.getParsedConfirmedTransaction(tx, "confirmed");
  console.log("tx result is")
  //console.log(JSON.stringify(txresult, null, 4));
  console.log(util.inspect(txresult, { showHidden: false, depth: null, colors: true }));
}

describe("router", () => {
  /* create and set a Provider */
  //const provider = anchor.AnchorProvider.local("http://localhost:8899", {"commitment":"finalized"});
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Router;
  connection = provider.connection;

  const programId = program.programId;
  console.log("router programId is", programId.toString());

  const mywallet = provider.wallet;
  console.log("my wallet is", mywallet.publicKey.toString());

  let _routerAccount, _bump;
  PublicKey.findProgramAddress([Buffer.from('Router')], programId)
    .then(([pdaAccount, bump]) => {
      _routerAccount = pdaAccount;
      _bump = bump;
      console.log("router account is", _routerAccount.toString(), "bump seed is", _bump);
    });

  const _tempAccount = Keypair.generate();
  console.log("temp account is", _tempAccount.publicKey.toString());

  it('Prepare balance by airdrop!', async () => {
    // Airdropping tokens to _tempAccount.
    await connection.confirmTransaction(
      await connection.requestAirdrop(_tempAccount.publicKey, 100 * LAMPORTS_PER_SOL),
      "confirmed"
    );
    // Airdropping tokens to _routerAccount.
    await connection.confirmTransaction(
      await connection.requestAirdrop(_routerAccount, 100 * LAMPORTS_PER_SOL),
      "confirmed"
    );

    let balance;
    balance = await connection.getBalance(_tempAccount.publicKey);
    console.log("temp account balance is", balance);

    balance = await connection.getBalance(_routerAccount);
    console.log("router account balance is", balance);

    balance = await connection.getBalance(mywallet.publicKey);
    console.log("mywallet account balance is", balance);
  });

  it('Is initialized!', async () => {
    const tx = await program.rpc.initialize(_bump, {
      accounts: {
        initializer: mywallet.publicKey,
        routerAccount: _routerAccount,
        mpc: _tempAccount.publicKey,
        systemProgram: SystemProgram.programId,
      },
      signers: [mywallet.payer],
    });
    console.log("initialize tx is", tx);
    await printTx(tx);

    /* Fetch the account and check the value of count */
    const account = await program.account.routerAccount.fetch(_routerAccount);
    console.log('pda mpc key: ', account.mpc.toString());
    assert.ok(account.mpc.equals(_tempAccount.publicKey));
  });

  it('Change MPC!', async () => {
    let tx = await program.rpc.changeMpc(mywallet.publicKey, {
      accounts: {
        mpc: _tempAccount.publicKey,
        routerAccount: _routerAccount,
        newMpc: mywallet.publicKey,
      },
      signers: [_tempAccount],
    });
    console.log("change mpc tx is", tx);
    await printTx(tx);

    /* Fetch the account and check the value of count */
    const account = await program.account.routerAccount.fetch(_routerAccount);
    console.log('pda mpc key: ', account.mpc.toString());
    assert.ok(account.mpc.equals(_tempAccount.publicKey));
    console.log('pda pending mpc key: ', account.pendingMpc.toString());
    assert.ok(account.pendingMpc.equals(mywallet.publicKey));
  })

  it('Apply MPC!', async () => {
    tx = await program.rpc.applyMpc({
      accounts: {
        signer: mywallet.publicKey,
        routerAccount: _routerAccount,
      },
      signers: [mywallet.payer],
    });
    console.log("apply mpc tx is", tx);
    await printTx(tx);

    /* Fetch the account and check the value of count */
    const account = await program.account.routerAccount.fetch(_routerAccount);
    console.log('pda mpc key: ', account.mpc.toString());
    assert.ok(account.mpc.equals(mywallet.publicKey));
    console.log('pda pending mpc key: ', account.pendingMpc.toString());
    assert.ok(account.pendingMpc.equals(PublicKey.default));
  });

  it('Set Paused!', async () => {
    let tx = await program.rpc.setPaused(true, {
      accounts: {
        mpc: mywallet.publicKey,
        routerAccount: _routerAccount,
      },
      signers: [mywallet.payer],
    });
    console.log("set paused to true tx is", tx);
    await printTx(tx);

    let account = await program.account.routerAccount.fetch(_routerAccount);
    console.log('paused flag is: ', account.paused);
    assert.ok(account.paused);


    tx = await program.rpc.setPaused(false, {
      accounts: {
        mpc: mywallet.publicKey,
        routerAccount: _routerAccount,
      },
      signers: [mywallet.payer],
    });
    console.log("set paused to false tx is", tx);
    await printTx(tx);

    account = await program.account.routerAccount.fetch(_routerAccount);
    console.log('paused flag is: ', account.paused);
    assert.ok(!account.paused);
  });

  it('Skim lamports!', async () => {
    /* Fetch the account and check the value of count */
    const account = await program.account.routerAccount.fetch(_routerAccount);
    console.log('skim: pda mpc key: ', account.mpc.toString());
    const tx = await program.rpc.skimLamports(new anchor.BN(LAMPORTS_PER_SOL), {
      accounts: {
        mpc: mywallet.publicKey,
        routerAccount: _routerAccount,
        systemProgram: SystemProgram.programId,
      },
      signers: [mywallet.payer],
    });
    console.log("skim lamports tx is", tx);
    await printTx(tx);

    let balance = await connection.getBalance(_routerAccount);
    console.log("router account balance is", balance);
  });

  let _tempMintA, _myTokenAccountA, _tempTokenAccountA, _routerAccountA;
  it('Prepare create token!', async () => {
    _tempMintA = await Token.createMint(
      connection, // connection
      _tempAccount, // payer
      _routerAccount, // mintAuthority
      null, // freezeAuthority
      0, // decimals
      TOKEN_PROGRAM_ID //programId
    );

    _myTokenAccountA = await _tempMintA.createAssociatedTokenAccount(mywallet.publicKey);
    _tempTokenAccountA = await _tempMintA.createAssociatedTokenAccount(_tempAccount.publicKey);
    _routerAccountA = await Token.getAssociatedTokenAddress(ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, _tempMintA.publicKey, _routerAccount, true);

    console.log("_tempMintA is", _tempMintA.publicKey.toString());
    console.log("_myTokenAccountA is", _myTokenAccountA.toString());
    console.log("_tempTokenAccountA is", _tempTokenAccountA.toString());
    console.log("_routerAccountA is", _routerAccountA.toString());
    console.log("TOKEN_PROGRAM_ID is", TOKEN_PROGRAM_ID.toString());
    console.log("ASSOCIATED_TOKEN_PROGRAM_ID is", ASSOCIATED_TOKEN_PROGRAM_ID.toString());

    let accountInfo = await connection.getParsedAccountInfo(_tempMintA.publicKey);
    console.log(`raw data: ${JSON.stringify(accountInfo.value.data["parsed"]["info"])}`);
  });

  it('Print all router program accounts!', async () => {
    const accounts = await connection.getParsedProgramAccounts(programId);
    console.log(`Found ${accounts.length} program account(s): `);
    accounts.forEach((account, i) => {
      console.log(`-- PDA Address ${i + 1}: ${account.pubkey.toString()} --`);
    });
  });

  it('Create ATA!', async () => {
    const tx = await program.rpc.createAssociatedToken({
      accounts: {
        payer: _tempAccount.publicKey,
        authority: _routerAccount,
        mint: _tempMintA.publicKey,
        associatedToken: _routerAccountA,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
        systemProgram: SystemProgram.programId,
      },
      signers: [_tempAccount],
    });
    console.log("create associated token tx is", tx);
    await printTx(tx);

    let accountInfo = await connection.getParsedAccountInfo(_routerAccountA);
    console.log(`ata raw data: ${JSON.stringify(accountInfo.value.data["parsed"]["info"])}`);
  });

  it('Swapin mint 1!', async () => {
    let swapinTx = "0xdce8e16a5b685b7713436b4adf4ffd66bd0387d8be5b423b7772990b469e4851";
    const tx = await program.rpc.swapinMint(
      swapinTx,
      new anchor.BN(10000),
      new anchor.BN(555), {
      accounts: {
        mpc: mywallet.publicKey,
        routerAccount: _routerAccount,
        to: _routerAccountA,
        mint: _tempMintA.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID
      },
      signers: [mywallet.payer],
    });
    console.log("swapinMint tx is", tx);
    await printTx(tx);

    let accountInfo = await connection.getParsedAccountInfo(_tempMintA.publicKey);
    let supply = accountInfo.value.data["parsed"]["info"]["supply"];
    console.log(`supply: ${supply}`);
    assert.ok(supply == 10000);

    let tokenAmount = await connection.getTokenAccountBalance(_routerAccountA);
    console.log(`ata token balance: ${tokenAmount.value.amount}`);

    accountInfo = await connection.getParsedAccountInfo(_routerAccountA);
    console.log(`ata raw data: ${JSON.stringify(accountInfo.value.data["parsed"]["info"])}`);
  });

  it('Swapin mint 2!', async () => {
    let swapinTx = "0xdce8e16a5b685b7713436b4adf4ffd66bd0387d8be5b423b7772990b469e4851";
    program.rpc.swapinMint(
      swapinTx,
      new anchor.BN(10000),
      new anchor.BN(555), {
      accounts: {
        mpc: _tempAccount.publicKey,
        routerAccount: _routerAccount,
        to: _tempTokenAccountA,
        mint: _tempMintA.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID
      },
      signers: [_tempAccount],
    }).catch((err) => {
      console.log("Good! found swapin mint error", err)
    }).then((tx) => {
      assert.ok(false, "swapin mint authority is not checked")
    });
  });

  it('Swapin transfer!', async () => {
    let swapinTx = "0xdce8e16a5b685b7713436b4adf4ffd66bd0387d8be5b423b7772990b469e4851";
    const tx = await program.rpc.swapinTransfer(
      swapinTx,
      new anchor.BN(1000),
      new anchor.BN(555), {
      accounts: {
        mpc: mywallet.publicKey,
        routerAccount: _routerAccount,
        from: _routerAccountA,
        to: _tempTokenAccountA,
        mint: _tempMintA.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID
      },
      signers: [mywallet.payer],
    });
    console.log("swapinTransfer tx is", tx);
    await printTx(tx);

    let tokenAmount = await connection.getTokenAccountBalance(_routerAccountA);
    console.log(`ata token balance: ${tokenAmount.value.amount}`);
    assert.ok(tokenAmount.value.amount == 9000);

    tokenAmount = await connection.getTokenAccountBalance(_tempTokenAccountA);
    console.log(`temp token balance: ${tokenAmount.value.amount}`);
    assert.ok(tokenAmount.value.amount == 1000);

    let accountInfo = await connection.getParsedAccountInfo(_tempTokenAccountA);
    console.log(`_tempTokenAccountA raw data: ${JSON.stringify(accountInfo.value.data["parsed"]["info"])}`);
  });

  it('Swapin native!', async () => {
    let prebalance = await connection.getBalance(_routerAccount);
    console.log("before: router account balance is", prebalance);

    prebalance = await connection.getBalance(_tempAccount.publicKey);
    console.log("before: temp account account balance is", prebalance);

    let swapinTx = "0xcce8e16a5b685b7713436b4adf4ffd66bd0387d8be5b423b7772990b469e4851";
    const tx = await program.rpc.swapinNative(
      swapinTx,
      new anchor.BN(2 * LAMPORTS_PER_SOL),
      new anchor.BN(555), {
      accounts: {
        mpc: mywallet.publicKey,
        routerAccount: _routerAccount,
        to: _tempAccount.publicKey,
        systemProgram: SystemProgram.programId,
      },
      signers: [mywallet.payer],
    });
    console.log("swapinNative tx is", tx);
    await printTx(tx);

    let balance = await connection.getBalance(_routerAccount);
    console.log("after: router account balance is", balance);

    balance = await connection.getBalance(_tempAccount.publicKey);
    console.log("after: temp account account balance is", balance);

    assert.ok(balance == prebalance + 2 * LAMPORTS_PER_SOL);
  });

  it('Swapout burn!', async () => {
    let bindAddr = "0xdce8e16a5b685b7713436b4adf4ffd66bd0387d8";
    const tx = await program.rpc.swapoutBurn(
      bindAddr,
      new anchor.BN(100),
      new anchor.BN(666), {
      accounts: {
        signer: _tempAccount.publicKey,
        routerAccount: _routerAccount,
        from: _tempTokenAccountA,
        mint: _tempMintA.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID
      },
      signers: [_tempAccount],
    });
    console.log("swapoutBurn tx is", tx);
    await printTx(tx);

    let accountInfo = await connection.getParsedAccountInfo(_tempMintA.publicKey);
    let supply = accountInfo.value.data["parsed"]["info"]["supply"];
    console.log(`supply: ${supply}`);
    assert.ok(supply == 9900);

    let tokenAmount = await connection.getTokenAccountBalance(_tempTokenAccountA);
    console.log(`temp token balance: ${tokenAmount.value.amount}`);
    assert.ok(tokenAmount.value.amount == 900);

    accountInfo = await connection.getParsedAccountInfo(_tempMintA.publicKey);
    console.log(`_tempMintA raw data: ${JSON.stringify(accountInfo.value.data["parsed"]["info"])}`);

    accountInfo = await connection.getParsedAccountInfo(_tempTokenAccountA);
    console.log(`_tempTokenAccountA raw data: ${JSON.stringify(accountInfo.value.data["parsed"]["info"])}`);
  });

  it('Swapout transfer!', async () => {
    let bindAddr = "0xdce8e16a5b685b7713436b4adf4ffd66bd0387d8";
    const tx = await program.rpc.swapoutTransfer(
      bindAddr,
      new anchor.BN(100),
      new anchor.BN(666), {
      accounts: {
        signer: _tempAccount.publicKey,
        routerAccount: _routerAccount,
        from: _tempTokenAccountA,
        to: _routerAccountA,
        mint: _tempMintA.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID
      },
      signers: [_tempAccount],
    });
    console.log("swapoutTransfer tx is", tx);
    await printTx(tx);

    let accountInfo = await connection.getParsedAccountInfo(_tempMintA.publicKey);
    console.log(`supply: ${accountInfo.value.data["parsed"]["info"]["supply"]}`);

    let tokenAmount = await connection.getTokenAccountBalance(_routerAccountA);
    console.log(`ata token balance: ${tokenAmount.value.amount}`);
    assert.ok(tokenAmount.value.amount == 9100);

    tokenAmount = await connection.getTokenAccountBalance(_tempTokenAccountA);
    console.log(`temp token balance: ${tokenAmount.value.amount}`);
    assert.ok(tokenAmount.value.amount == 800);

    accountInfo = await connection.getParsedAccountInfo(_tempTokenAccountA);
    console.log(`_tempTokenAccountA raw data: ${JSON.stringify(accountInfo.value.data["parsed"]["info"])}`);

    accountInfo = await connection.getParsedAccountInfo(_routerAccountA);
    console.log(`_routerAccountA raw data: ${JSON.stringify(accountInfo.value.data["parsed"]["info"])}`);
  });

  it('Swapout native!', async () => {
    let prebalance = await connection.getBalance(_tempAccount.publicKey);
    console.log("before: temp account account balance is", prebalance);

    prebalance = await connection.getBalance(_routerAccount);
    console.log("before: router account balance is", prebalance);

    let bindAddr = "0xdce8e16a5b685b7713436b4adf4ffd66bd0387d8";
    const tx = await program.rpc.swapoutNative(
      bindAddr,
      new anchor.BN(LAMPORTS_PER_SOL),
      new anchor.BN(666), {
      accounts: {
        signer: _tempAccount.publicKey,
        routerAccount: _routerAccount,
        systemProgram: SystemProgram.programId,
      },
      signers: [_tempAccount],
    });
    console.log("swapoutNative tx is", tx);
    await printTx(tx);

    let balance = await connection.getBalance(_tempAccount.publicKey);
    console.log("after: temp account account balance is", balance);

    balance = await connection.getBalance(_routerAccount);
    console.log("after: router account balance is", balance);

    assert.ok(balance == prebalance + LAMPORTS_PER_SOL);
  });

  it('Test Pause!', async () => {
    let tx = await program.rpc.setPaused(
      true, {
      accounts: {
        mpc: mywallet.publicKey,
        routerAccount: _routerAccount,
      },
      signers: [mywallet.payer],
    });
    console.log("setPaused tx is", tx);
    await printTx(tx);

    let bindAddr = "0xdce8e16a5b685b7713436b4adf4ffd66bd0387d8";
    await program.rpc.swapoutNative(
      bindAddr,
      new anchor.BN(LAMPORTS_PER_SOL),
      new anchor.BN(666), {
      accounts: {
        signer: _tempAccount.publicKey,
        routerAccount: _routerAccount,
        systemProgram: SystemProgram.programId,
      },
      signers: [_tempAccount],
    }).catch((err) => {
      console.log("Good! found swapout stop", err)
    }).then((tx) => {
      console.log("tx", tx)
      assert.ok(!tx, "swapout stop")
    });
  });

  it('Test Unpause!', async () => {
    let tx = await program.rpc.setPaused(
      false, {
      accounts: {
        mpc: mywallet.publicKey,
        routerAccount: _routerAccount,
      },
      signers: [mywallet.payer],
    });
    console.log("setPaused tx is", tx);
    await printTx(tx);

    let bindAddr = "0xdce8e16a5b685b7713436b4adf4ffd66bd0387d8";
    const swaptx = await program.rpc.swapoutNative(
      bindAddr,
      new anchor.BN(LAMPORTS_PER_SOL),
      new anchor.BN(666), {
      accounts: {
        signer: _tempAccount.publicKey,
        routerAccount: _routerAccount,
        systemProgram: SystemProgram.programId,
      },
      signers: [_tempAccount],
    });
    console.log("swapoutNative tx is", swaptx);
    await printTx(swaptx);

  });

  it('Change MPC again!', async () => {
    const tx = await program.rpc.changeMpc(
      _tempAccount.publicKey, {
      accounts: {
        mpc: mywallet.publicKey,
        routerAccount: _routerAccount,
        newMpc: _tempAccount.publicKey,
      },
      signers: [mywallet.payer],
    });
    console.log("change mpc again tx is", tx);
    await printTx(tx);

    /* Fetch the account and check the value of count */
    const account = await program.account.routerAccount.fetch(_routerAccount);
    console.log('pda mpc key: ', account.mpc.toString());
    assert.ok(account.mpc.equals(mywallet.publicKey));
    console.log('pda pending mpc key: ', account.pendingMpc.toString());
    assert.ok(account.pendingMpc.equals(_tempAccount.publicKey));
  })

  it('Apply MPC again!', async () => {
    tx = await program.rpc.applyMpc({
      accounts: {
        signer: _tempAccount.publicKey,
        routerAccount: _routerAccount,
      },
      signers: [_tempAccount],
    });
    console.log("apply mpc again tx is", tx);
    await printTx(tx);

    /* Fetch the account and check the value of count */
    const account = await program.account.routerAccount.fetch(_routerAccount);
    console.log('pda mpc key: ', account.mpc.toString());
    assert.ok(account.mpc.equals(_tempAccount.publicKey));
    console.log('pda pending mpc key: ', account.pendingMpc.toString());
    assert.ok(account.pendingMpc.equals(PublicKey.default));
  });

});
/* vim: set ts=2 sts=2 sw=2 et : */
