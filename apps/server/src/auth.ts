import { PrivyClient } from '@privy-io/node';

const appId = process.env.PRIVY_APP_ID || '';
const appSecret = process.env.PRIVY_APP_SECRET || '';
const apiUrl = process.env.PRIVY_API_URL;

const privyClient = appId && appSecret
  ? new PrivyClient({ appId, appSecret, apiUrl })
  : null;

export const privyEnabled = Boolean(privyClient);

export const verifyPrivyAccess = async (accessToken: string, identityToken?: string) => {
  if (!privyClient) {
    throw new Error('Auth unavailable.');
  }

  const access = await privyClient.utils().auth().verifyAccessToken(accessToken);
  const user = identityToken
    ? await privyClient.users().get({ id_token: identityToken })
    : null;

  const linkedAccounts = (user as {
    linked_accounts?: Array<{
      type?: string;
      address?: string;
      username?: string;
      handle?: string;
      screen_name?: string;
      profile_image_url?: string;
      avatar_url?: string;
      profile_picture_url?: string;
    }>;
  })?.linked_accounts;
  const wallet = linkedAccounts?.find((account) => account.type === 'wallet' || account.type === 'smart_wallet');
  const twitterAccount = linkedAccounts?.find((account) => account.type?.toLowerCase().includes('twitter'));
  const handle = twitterAccount?.username
    ?? twitterAccount?.handle
    ?? twitterAccount?.screen_name
    ?? null;
  const avatarUrl = twitterAccount?.profile_image_url
    ?? twitterAccount?.avatar_url
    ?? twitterAccount?.profile_picture_url
    ?? null;

  return {
    userId: access.user_id,
    walletAddress: wallet?.address ?? null,
    handle,
    avatarUrl,
  };
};
