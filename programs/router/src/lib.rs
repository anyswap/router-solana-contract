use anchor_lang::prelude::*;
use anchor_lang::solana_program::program_option::COption;
use anchor_lang::solana_program::{self, system_instruction};
use anchor_spl::associated_token::{self, get_associated_token_address, AssociatedToken, Create};
use anchor_spl::token::{self, Burn, Mint, MintTo, Token, TokenAccount, Transfer};

declare_id!("5F3j1TvB7CQa4XRFN48iAd8y2ZgXXzUTVMJvtFXvF4N");

const ROUTER_PDA_SEEDS: &[u8] = b"Router";

#[program]
pub mod router {
    use super::*;

    /// Create pda account `router_account`, init `mpc`
    /// `mpc` is the authority account to manage `router_account`
    pub fn initialize(ctx: Context<Initialize>, bump_seed: u8) -> ProgramResult {
        let (_pda, bump) = Pubkey::find_program_address(&[&ROUTER_PDA_SEEDS[..]], ctx.program_id);
        require!(bump == bump_seed, ProgramError::InvalidArgument);

        ctx.accounts.router_account.mpc = *ctx.accounts.mpc.key;
        ctx.accounts.router_account.bump = bump;

        Ok(())
    }

    /// create router account's associated token
    pub fn create_associated_token(ctx: Context<CreateATA>) -> ProgramResult {
        associated_token::create(ctx.accounts.into_create_ata_context())?;

        Ok(())
    }

    /// Change manage account of pda account `router_account`
    pub fn change_mpc(ctx: Context<ChangeMPC>, new: Pubkey) -> ProgramResult {
        ctx.accounts.router_account.mpc = new;

        Ok(())
    }

    /// Swapin by mint token from pda account `router_account` to receiver
    /// The signer must be `router_account.mpc`
    pub fn swapin_mint(
        ctx: Context<SwapinMint>,
        tx: String,
        amount: u64,
        from_chainid: u64,
    ) -> ProgramResult {
        let authority_seeds = &[&ROUTER_PDA_SEEDS[..], &[ctx.accounts.router_account.bump]];
        token::mint_to(
            ctx.accounts
                .into_mint_context()
                .with_signer(&[&authority_seeds[..]]),
            amount,
        )?;
        let to = ctx.accounts.to.key();
        msg!(&format!(
            "SwapinMint {} {} {} {}",
            tx, to, amount, from_chainid
        ));

        Ok(())
    }

    /// Swapin by transfer token from pda account `router_account` to receiver
    /// The signer must be `router_account.mpc`
    pub fn swapin_transfer(
        ctx: Context<SwapinTransfer>,
        tx: String,
        amount: u64,
        from_chainid: u64,
    ) -> ProgramResult {
        let ata = get_associated_token_address(
            &ctx.accounts.router_account.key(),
            &ctx.accounts.mint.key(),
        );
        require!(
            ctx.accounts.from.key() == ata,
            RouterError::SwapinTransferFromWrongAccount
        );
        let authority_seeds = &[&ROUTER_PDA_SEEDS[..], &[ctx.accounts.router_account.bump]];
        token::transfer(
            ctx.accounts
                .into_transfer_context()
                .with_signer(&[&authority_seeds[..]]),
            amount,
        )?;
        let to = ctx.accounts.to.key();
        msg!(&format!(
            "SwapinTransfer {} {} {} {}",
            tx, to, amount, from_chainid
        ));

        Ok(())
    }

    /// Swapin by transfer native SOL from pda account `router_account` to receiver
    /// The signer must be `router_account.mpc`
    pub fn swapin_native(
        ctx: Context<SwapinNative>,
        tx: String,
        lamports: u64,
        from_chainid: u64,
    ) -> ProgramResult {
        let from = ctx.accounts.router_account.to_account_info();
        let dest = ctx.accounts.to.to_account_info();

        tools::transfer_lamports_from_router(from, dest, lamports, true)?;

        let to = ctx.accounts.to.key();
        msg!(&format!(
            "SwapinNative {} {} {} {}",
            tx, to, lamports, from_chainid
        ));

        Ok(())
    }

    /// Swapout by burn token whose mint authority is pda account `router_account`
    pub fn swapout_burn(
        ctx: Context<SwapoutBurn>,
        to: String,
        amount: u64,
        to_chainid: u64,
    ) -> ProgramResult {
        let router_account = ctx.accounts.router_account.key();
        let mint_authority = ctx.accounts.mint.mint_authority;
        require!(
            mint_authority == COption::Some(router_account),
            RouterError::InvalidRouterMintAuthority
        );
        token::burn(ctx.accounts.into_burn_context(), amount)?;
        let mint = ctx.accounts.mint.key();
        msg!(&format!(
            "SwapoutBurn {} {} {} {}",
            to, mint, amount, to_chainid
        ));

        Ok(())
    }

    /// Swapout by transfer token to pda account `router_account`
    pub fn swapout_transfer(
        ctx: Context<SwapoutTransfer>,
        to: String,
        amount: u64,
        to_chainid: u64,
    ) -> ProgramResult {
        let ata = get_associated_token_address(
            &ctx.accounts.router_account.key(),
            &ctx.accounts.mint.key(),
        );
        require!(
            ctx.accounts.to.key() == ata,
            RouterError::SwapoutTransferToWrongAccount
        );
        token::transfer(ctx.accounts.into_transfer_context(), amount)?;
        let mint = ctx.accounts.mint.key();
        msg!(&format!(
            "SwapoutTransfer {} {} {} {}",
            to, mint, amount, to_chainid
        ));

        Ok(())
    }

    /// Swapout by transfer native SOL to pda account `router_account`
    pub fn swapout_native(
        ctx: Context<SwapoutNative>,
        to: String,
        lamports: u64,
        to_chainid: u64,
    ) -> ProgramResult {
        let from = ctx.accounts.signer.to_account_info();
        let dest = ctx.accounts.router_account.to_account_info();

        solana_program::program::invoke(
            &system_instruction::transfer(&from.key(), &dest.key(), lamports),
            &ctx.accounts.to_account_infos(),
        )?;

        msg!(&format!(
            "SwapoutNative {} native {} {}",
            to, lamports, to_chainid
        ));

        Ok(())
    }

    /// Skim lamports from pda account `router_account` to mpc account
    /// The signer must be `router_account.mpc`
    pub fn skim_lamports(ctx: Context<SkimLamports>, lamports: u64) -> ProgramResult {
        let from = ctx.accounts.router_account.to_account_info();
        let dest = ctx.accounts.mpc.to_account_info();

        tools::transfer_lamports_from_router(from, dest, lamports, true)?;

        Ok(())
    }
}

mod tools {
    use super::*;

    pub fn transfer_lamports_from_router<'info>(
        from: AccountInfo<'info>,
        to: AccountInfo<'info>,
        lamports: u64,
        keep_rent_exemption: bool,
    ) -> ProgramResult {
        let from_lamports = from.lamports();
        let dest_lamports = to.lamports();

        if keep_rent_exemption {
            let rent_exemption = Rent::get()?.minimum_balance(from.data_len());
            if from_lamports < lamports + rent_exemption {
                msg!("Insufficent balance to keep rent exemption");
                return Err(ProgramError::InsufficientFunds);
            }
        }

        **to.lamports.borrow_mut() = dest_lamports.checked_add(lamports).unwrap();
        **from.lamports.borrow_mut() = from_lamports.checked_sub(lamports).unwrap();

        Ok(())
    }
}

#[error]
pub enum RouterError {
    #[msg("Only mpc can operate")]
    OnlyMPC,
    #[msg("Invalid router mint authority")]
    InvalidRouterMintAuthority,
    #[msg("Swapin from wrong account")]
    SwapinTransferFromWrongAccount,
    #[msg("Swapout to wrong account")]
    SwapoutTransferToWrongAccount,
}

#[account]
#[derive(Default)]
pub struct RouterAccount {
    pub mpc: Pubkey,
    pub bump: u8,
}

#[derive(Accounts)]
#[instruction(bump_seed: u8)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub initializer: Signer<'info>,
    #[account(
		init,
        seeds = [ROUTER_PDA_SEEDS.as_ref()],
        bump = bump_seed,
		space = 8 + 33,
		payer = initializer,
	)]
    pub router_account: Account<'info, RouterAccount>,
    pub mpc: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateATA<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(owner = *program_id)]
    pub authority: Account<'info, RouterAccount>,
    #[account(owner = *token_program.key)]
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub associated_token: AccountInfo<'info>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

#[derive(Accounts)]
pub struct SwapinMint<'info> {
    #[account(mut)]
    pub mpc: Signer<'info>,
    #[account(owner = *program_id, has_one = mpc @RouterError::OnlyMPC)]
    pub router_account: Account<'info, RouterAccount>,
    #[account(mut, has_one = mint)]
    pub to: Account<'info, TokenAccount>,
    #[account(mut, owner = *token_program.key)]
    pub mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SwapinTransfer<'info> {
    #[account(mut)]
    pub mpc: Signer<'info>,
    #[account(owner = *program_id, has_one = mpc @RouterError::OnlyMPC)]
    pub router_account: Account<'info, RouterAccount>,
    #[account(mut, has_one = mint)]
    pub from: Account<'info, TokenAccount>,
    #[account(mut, has_one = mint)]
    pub to: Account<'info, TokenAccount>,
    #[account(mut, owner = *token_program.key)]
    pub mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SwapinNative<'info> {
    #[account(mut)]
    pub mpc: Signer<'info>,
    #[account(mut, owner = *program_id, has_one = mpc @RouterError::OnlyMPC)]
    pub router_account: Account<'info, RouterAccount>,
    #[account(mut)]
    pub to: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SwapoutBurn<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(owner = *program_id)]
    pub router_account: Account<'info, RouterAccount>,
    #[account(mut, has_one = mint)]
    pub from: Account<'info, TokenAccount>,
    #[account(mut, owner = *token_program.key)]
    pub mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SwapoutTransfer<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(owner = *program_id)]
    pub router_account: Account<'info, RouterAccount>,
    #[account(mut, has_one = mint)]
    pub from: Account<'info, TokenAccount>,
    #[account(mut, has_one = mint)]
    pub to: Account<'info, TokenAccount>,
    #[account(mut, owner = *token_program.key)]
    pub mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SwapoutNative<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(mut, owner = *program_id)]
    pub router_account: Account<'info, RouterAccount>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(new: Pubkey)]
pub struct ChangeMPC<'info> {
    #[account(mut)]
    pub mpc: Signer<'info>,
    #[account(mut, owner = *program_id, has_one = mpc @RouterError::OnlyMPC)]
    pub router_account: Account<'info, RouterAccount>,
    #[account(address = new)]
    pub new_mpc: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct SkimLamports<'info> {
    #[account(mut)]
    pub mpc: Signer<'info>,
    #[account(mut, owner = *program_id, has_one = mpc @RouterError::OnlyMPC)]
    pub router_account: Account<'info, RouterAccount>,
    pub system_program: Program<'info, System>,
}

impl<'info> CreateATA<'info> {
    fn into_create_ata_context(&self) -> CpiContext<'_, '_, '_, 'info, Create<'info>> {
        let cpi_accounts = Create {
            payer: self.payer.to_account_info().clone(),
            authority: self.authority.to_account_info().clone(),
            mint: self.mint.to_account_info().clone(),
            associated_token: self.associated_token.to_account_info().clone(),
            token_program: self.token_program.to_account_info().clone(),
            rent: self.rent.to_account_info().clone(),
            system_program: self.system_program.to_account_info().clone(),
        };
        CpiContext::new(
            self.associated_token_program.to_account_info().clone(),
            cpi_accounts,
        )
    }
}

impl<'info> SwapinMint<'info> {
    fn into_mint_context(&self) -> CpiContext<'_, '_, '_, 'info, MintTo<'info>> {
        let cpi_accounts = MintTo {
            mint: self.mint.to_account_info().clone(),
            to: self.to.to_account_info().clone(),
            authority: self.router_account.to_account_info().clone(),
        };
        CpiContext::new(self.token_program.to_account_info().clone(), cpi_accounts)
    }
}

impl<'info> SwapinTransfer<'info> {
    fn into_transfer_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let cpi_accounts = Transfer {
            from: self.from.to_account_info().clone(),
            to: self.to.to_account_info().clone(),
            authority: self.router_account.to_account_info().clone(),
        };
        CpiContext::new(self.token_program.to_account_info().clone(), cpi_accounts)
    }
}

impl<'info> SwapoutBurn<'info> {
    fn into_burn_context(&self) -> CpiContext<'_, '_, '_, 'info, Burn<'info>> {
        let cpi_accounts = Burn {
            mint: self.mint.to_account_info().clone(),
            to: self.from.to_account_info().clone(),
            authority: self.signer.to_account_info().clone(),
        };
        CpiContext::new(self.token_program.to_account_info().clone(), cpi_accounts)
    }
}

impl<'info> SwapoutTransfer<'info> {
    fn into_transfer_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let cpi_accounts = Transfer {
            from: self.from.to_account_info().clone(),
            to: self.to.to_account_info().clone(),
            authority: self.signer.to_account_info().clone(),
        };
        CpiContext::new(self.token_program.to_account_info().clone(), cpi_accounts)
    }
}
