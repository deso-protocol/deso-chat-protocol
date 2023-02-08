import { useContext, useEffect, useState } from "react";
import { DesoContext } from "../contexts/desoContext";
import { MessagingDisplayAvatar } from "./messaging-display-avatar";
import { Menu, MenuHandler, MenuItem, MenuList } from "@material-tailwind/react";
import { clearAllState } from "../utils/store";
import { getProfileURL } from "../utils/helpers";
import { shortenLongWord } from "./search-users";
import { SaveToClipboard } from "./shared/save-to-clipboard";

export const Header = () => {
  const { deso, hasSetupAccount, loggedInPublicKey } = useContext(DesoContext);
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const getMyUsername = async () => {
      setLoading(true);

      try {
        const response = await deso.user.getSingleProfile({
          PublicKeyBase58Check: deso.identity.getUserKey() as string,
          NoErrorOnMissing: true,
        });
        setUsername(response?.Profile?.Username || "");
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    if (hasSetupAccount || loggedInPublicKey) {
      getMyUsername();
    } else {
      setLoading(false);
    }
  }, [hasSetupAccount, loggedInPublicKey]);

  const userKey = deso.identity.getUserKey();

  return (
    <header className="flex justify-between px-4 fixed top-0 z-50 bg-black/40 w-full backdrop-blur-md h-[80px]">
      <a href="/" className="flex items-center">
        <div className="text-left">
          <img src="/assets/logo-white.svg" width={100} alt="deso-logo" />
        </div>
      </a>

      <div className="flex items-center">
        <div className="flex items-center ml-2">
          { userKey && !loading && (
            <div className="flex flex-col items-end pr-2">
              <div className="mb-1 text-blue-100 text-sm">
                Hi, <span className="font-semibold">{username ? "@" : ""}{(username || shortenLongWord(userKey ?? '')) ?? 'need to login in first'}</span>
              </div>
              <a
                className="block text-blue-200/80 text-sm"
                href="https://signup.deso.com/wallet"
                target="_blank"
                rel="noreferrer"
              >
                View Wallet
              </a>
            </div>
          )}


          <Menu placement="bottom-end">
            <MenuHandler>
              <div className="cursor-pointer">
                <MessagingDisplayAvatar
                  publicKey={userKey ?? undefined}
                  diameter={35}
                  classNames="ml-3"
                />
              </div>
            </MenuHandler>

            <MenuList>
              {username && (
                <MenuItem className="flex items-center p-0">
                  <a href={getProfileURL(username)} target="_blank" rel="noreferrer" className="w-full outline-0">
                    <div className="w-full flex items-center pt-[9px] pb-2 px-3">
                      <img src="/assets/external-link.png" width={20} className="mr-2" alt="external-link" />

                      <span className="text-base">
                      My Profile
                    </span>
                    </div>
                  </a>
                </MenuItem>
              )}

              {userKey && (
                <MenuItem className="flex items-center p-0">
                  <SaveToClipboard
                    text={userKey}
                    copyIcon={<img src="/assets/copy.png" className="invert" width={20} alt="copy-to-clipboard" />}
                    copiedIcon={<img src="/assets/copy-filled.png" className="invert" width={20} alt="copied-to-clipboard" />}
                    className="w-full pt-[9px] pb-2 px-3"
                  >
                  <span className="text-base">
                    Copy public key
                  </span>
                  </SaveToClipboard>
                </MenuItem>
              )}

              <MenuItem
                className="flex items-center"
                onClick={async () => {
                  await deso.identity.login('1');
                  await window.location.reload();
                }}
              >
                <img src="/assets/change-user.png" width={20} className="mr-2" alt="switch-user" />

                <span className="text-base">
                  Switch user
                </span>
              </MenuItem>

              <MenuItem
                className="flex items-center"
                onClick={async () => {
                  if (!userKey) return;
                  await deso.identity.logout(userKey);
                  clearAllState(userKey);
                  await window.location.reload();
                }}
              >
                <img src="/assets/logout.png" width={20} className="mr-2" alt="logout" />

                <span className="text-base">
                  Logout
                </span>
              </MenuItem>
            </MenuList>
          </Menu>
        </div>
      </div>
    </header>
  )
}
