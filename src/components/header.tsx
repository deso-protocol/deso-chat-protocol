import { identity } from "@deso-core/identity";
import {
  Menu,
  MenuHandler,
  MenuItem,
  MenuList,
} from "@material-tailwind/react";
import { UserContext } from "contexts/UserContext";
import { useContext } from "react";
import { IoCopy, IoCopyOutline, IoExitOutline, IoHappyOutline, IoLogoGithub, IoPersonAddOutline } from "react-icons/io5";
import { formatDisplayName, getProfileURL } from "../utils/helpers";
import { MessagingDisplayAvatar } from "./messaging-display-avatar";
import { SaveToClipboard } from "./shared/save-to-clipboard";

export const Header = () => {
  const { appUser } = useContext(UserContext);

  return (
    <header className="flex justify-between py-3 px-4 fixed top-0 z-50 bg-black/40 w-full backdrop-blur-md">
      <a href="/" className="flex items-center">
        <div className="text-left flex">
          <img src="/assets/logo-white.svg" width={80} alt="deso-logo" />
          <span className="text-blue-300/60 ml-3">Chat Protocol</span>
        </div>
      </a>

      <div className="flex items-center">
        <div className="flex items-center ml-2">
          {appUser && (
            <div className="flex flex-col items-end pr-2">
              <div className="mb-0 text-blue-100 text-sm">
                Hi,{" "}
                <span className="font-semibold">
                  {formatDisplayName(appUser)}
                </span>
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
                  publicKey={appUser?.PublicKeyBase58Check}
                  diameter={35}
                  classNames="ml-3"
                />
              </div>
            </MenuHandler>

            <MenuList>
              {appUser?.ProfileEntryResponse && (
                <MenuItem className="flex items-center p-0">
                  <a
                    href={getProfileURL(appUser.ProfileEntryResponse.Username)}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full outline-0"
                  >
                    <div className="w-full flex items-center pt-[9px] pb-2 px-3">
                      <IoHappyOutline className="mr-3 text-xl"/>
                      <span className="text-base">My profile</span>
                    </div>
                  </a>
                </MenuItem>
              )}

              {appUser && (
                <MenuItem className="flex items-center pt-[9px] pb-2 px-3">
                  <SaveToClipboard
                    text={appUser.PublicKeyBase58Check}
                    copyIcon={
                      <IoCopyOutline className="text-xl"/>
                    }
                    copiedIcon={
                      <IoCopy className="text-xl"/>
                    }
                    className=""
                  >
                    <span className="text-base">Copy public key</span>
                  </SaveToClipboard>
                </MenuItem>
              )}

              <MenuItem
                className="flex items-center"
                onClick={() => identity.login()}
              >
               <IoPersonAddOutline className="mr-3 text-xl"/>
                <span className="text-base">Switch user</span>
              </MenuItem>

              <MenuItem className="flex items-center p-0">
                <a
                  href="https://github.com/deso-protocol/deso-chat-protocol"
                  target="_blank"
                  rel="noreferrer"
                  className="w-full outline-0"
                  >
                    <div className="w-full flex items-center pt-[9px] pb-2 px-3">
                      <IoLogoGithub className="mr-3 text-xl"/>
                      <span className="text-base">Github code</span>
                    </div>
                  </a>
                </MenuItem>

              <MenuItem
                className="flex items-center"
                onClick={() => identity.logout()}
              >
                <IoExitOutline className="mr-3 text-xl"/>
                <span className="text-base">Logout</span>
              </MenuItem>
            </MenuList>
          </Menu>
        </div>
      </div>
    </header>
  );
};
