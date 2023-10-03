import { Combobox } from "@headlessui/react";
import {
  getProfiles,
  getSingleProfile,
  identity,
  ProfileEntryResponse,
} from "deso-protocol";
import { ethers } from "ethers";
import debounce from "lodash/debounce";
import { Fragment, useContext, useEffect, useState } from "react";
import ClipLoader from "react-spinners/ClipLoader";
import { toast } from "react-toastify";
import { UserContext } from "../contexts/UserContext";
import {
  isMaybeDeSoPublicKey,
  isMaybeENSName,
  isMaybeETHAddress,
} from "../utils/helpers";
import { MessagingDisplayAvatar } from "./messaging-display-avatar";
import { MyErrorLabel } from "./form/my-error-label";

export const shortenLongWord = (
  key: string | null,
  endFirstPartAfter = 6,
  startSecondPartAfter = 6,
  separator = "..."
) => {
  if (
    !key ||
    key.length <= endFirstPartAfter + startSecondPartAfter + separator.length
  ) {
    return key || "";
  }

  return [
    key.slice(0, endFirstPartAfter),
    separator,
    key.slice(-startSecondPartAfter),
  ].join("");
};
export const nameOrFormattedKey = (
  profile: ProfileEntryResponse | null,
  key: string
) => {
  return profile?.Username || shortenLongWord(key, 6, 6);
};

export interface SearchMenuItem {
  id: string;
  profile: ProfileEntryResponse | null;
  text: string;
}

interface SearchUsersProps {
  placeholder?: string;
  hasPersistentDisplayValue?: boolean;
  initialValue?: string;
  onSelected: (item: SearchMenuItem | null) => void;
  error?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  onTyping?: any;
  className?: string;
}

export const SearchUsers = ({
  placeholder = "Search for users",
  hasPersistentDisplayValue = false,
  initialValue = "",
  onSelected,
  error,
  onFocus,
  onBlur,
  onTyping,
  className = "",
}: SearchUsersProps) => {
  const [menuItems, setMenuItems] = useState<SearchMenuItem[]>();
  const [inputValue, setInputValue] = useState(initialValue);
  const [loading, setLoading] = useState(false);
  // TODO: we should roll this into the identity package since we already need
  // the ethers package there to recover the public key from a signature.
  const provider = new ethers.providers.InfuraProvider("homestead"); //, process.env.REACT_APP_INFURA_API_KEY);

  const { appUser } = useContext(UserContext);

  useEffect(() => {
    setInputValue(initialValue);
  }, [initialValue]);

  const searchForPublicKey = async (
    publicKey: string
  ): Promise<SearchMenuItem> => {
    const res = await getSingleProfile({
      PublicKeyBase58Check: publicKey,
      NoErrorOnMissing: true,
    });

    const item = {
      id: publicKey,
      profile: res?.Profile,
      text: nameOrFormattedKey(res?.Profile, publicKey),
    };
    await onSelected(item);
    setInputValue("");
    setMenuItems([]);
    return item;
  };

  const _getProfiles = async (query: string) => {
    // TODO: find way to not pound infura API.
    try {
      if (isMaybeENSName(query)) {
        const ethAddress = await provider.resolveName(query);
        if (!ethAddress) {
          return Promise.reject(`unable to resolve ENS name ${query}`);
        }
        const desoPublicKey = await identity.ethereumAddressToDesoAddress(
          ethAddress
        );
        await searchForPublicKey(desoPublicKey);
        return;
      } else if (isMaybeETHAddress(query)) {
        const desoPublicKey = await identity.ethereumAddressToDesoAddress(
          query
        );
        await searchForPublicKey(desoPublicKey);
        return;
      } else if (isMaybeDeSoPublicKey(query)) {
        await searchForPublicKey(query);
        return;
      }
    } catch (e: any) {
      if (
        e?.message
          ?.toString()
          .startsWith(
            "GetSingleProfile: could not find profile for username or public key"
          )
      ) {
        return;
      }
    }

    const res = await getProfiles({
      PublicKeyBase58Check: "",
      Username: "",
      UsernamePrefix: query,
      Description: "",
      OrderBy: "",
      NumToFetch: 7,
      ReaderPublicKeyBase58Check: appUser?.PublicKeyBase58Check ?? "",
      ModerationType: "",
      FetchUsersThatHODL: false,
      AddGlobalFeedBool: false,
    });

    setMenuItems(
      (res.ProfilesFound || []).map((p) => ({
        id: p.PublicKeyBase58Check,
        profile: p,
        text: nameOrFormattedKey(p, p.PublicKeyBase58Check),
      }))
    );
  };

  const getProfilesDebounced = debounce(async (q: string) => {
    setLoading(true);
    await _getProfiles(q)
      .catch((e) => {
        console.error(e);
        toast.error(e);
      })
      .finally(() => setLoading(false));
  }, 500);
  const shownItems = menuItems || [];

  return (
    <div className="relative">
      <Combobox
        nullable={true}
        value={inputValue}
        onChange={(value) => {
          if (!value) {
            setInputValue("");
            onSelected(null);
            return;
          }

          const menuItem = shownItems.find(({ id }) => id === value);

          if (!menuItem) {
            return;
          }

          if (hasPersistentDisplayValue) {
            setInputValue(menuItem.id);
          }
          onSelected(menuItem);
        }}
      >
        <div className="relative">
          <Combobox.Input
            placeholder={placeholder}
            spellCheck={false}
            className={`w-full rounded-md ${className} text-blue-100 bg-blue-900/20 ${
              error
                ? "border border-red-500"
                : "ring:border-blue-600 border-transparent"
            }`}
            onChange={async (ev) => {
              const name = ev.target.value.trim();

              if (!name) {
                setInputValue("");
                setMenuItems([]);
                return;
              }

              if (onTyping) {
                onTyping(name, (items: Array<SearchMenuItem>) => {
                  setMenuItems(items);
                });
                return;
              }
              await getProfilesDebounced(name);
            }}
            onFocus={onFocus}
            onBlur={onBlur}
          />

          <MyErrorLabel error={error} />
        </div>
        <Combobox.Options
          className={`absolute z-10 w-full bg-white text-black max-h-80 mt-1 rounded-md overflow-y-scroll custom-scrollbar bg-blue-900/20 text-blue-100 ${
            loading || shownItems.length > 0 ? "border border-blue-900" : ""
          }`}
        >
          <Combobox.Option
            value={false}
            className="pointer-events-none bg-[#050e1d] text-blue-100"
          >
            {loading && (
              <div className="flex justify-center">
                <ClipLoader
                  color={"#0d3679"}
                  loading={loading}
                  size={28}
                  className="my-4"
                />
              </div>
            )}
          </Combobox.Option>
          {!loading &&
            shownItems.map(({ id, profile, text }) => (
              <Combobox.Option key={id} value={id} as={Fragment}>
                {({ active }) => (
                  <li
                    className={`bg-[#050e1d] text-blue-100 hover:bg-blue-800 ${
                      active && id ? "bg-gray-faint" : ""
                    }`}
                  >
                    <div className="flex p-2 items-center cursor-pointer">
                      {profile && (
                        <MessagingDisplayAvatar
                          publicKey={profile.PublicKeyBase58Check}
                          diameter={50}
                          classNames="mx-0"
                        />
                      )}
                      <span className="ml-4">{text}</span>
                    </div>
                  </li>
                )}
              </Combobox.Option>
            ))}
        </Combobox.Options>
      </Combobox>
    </div>
  );
};
