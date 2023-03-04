import { buildProfilePictureUrl } from "deso-protocol";
import toMaterialStyle from "material-color-hash";
import { FC, ReactElement, useEffect, useState } from "react";
import { getProfileURL } from "../utils/helpers";

function ConditionalLink({
  children,
  condition,
  href,
  target,
  className,
  style,
  onClick,
}: {
  children: ReactElement;
  condition: boolean;
  href: string;
  target: string;
  className: string;
  style: any;
  onClick: (e: any) => void;
}) {
  return condition ? (
    <a
      href={href}
      target={target}
      rel="noreferrer"
      className={`w-full ${className}`}
      style={style}
      onClick={onClick}
    >
      {children}
    </a>
  ) : (
    <div className={className} style={style}>
      {children}
    </div>
  );
}

const DEFAULT_PROFILE_PIC_URL = "/assets/default-profile-pic.png";

export const MessagingDisplayAvatar: FC<{
  publicKey?: string;
  username?: string;
  borderColor?: string;
  diameter: number;
  classNames?: string;
  groupChat?: boolean;
}> = ({
  publicKey,
  username,
  diameter,
  borderColor = "border-white",
  classNames = "",
  groupChat = false,
}) => {
  const [profilePicUrl, setProfilePicUrl] = useState("");

  useEffect(() => {
    let profilePicUrl = "";

    if (!publicKey) {
      setProfilePicUrl(DEFAULT_PROFILE_PIC_URL);
      return;
    }

    if (groupChat) {
      const keyFirstLast = `${publicKey.charAt(0)}${publicKey.charAt(
        publicKey.length - 1
      )}`;
      const bgColor = toMaterialStyle(keyFirstLast, 200);
      const key = publicKey.replace(/[^a-zA-Z0-9]+/g, "");
      profilePicUrl = `https://ui-avatars.com/api/?name=${key}&background=${bgColor.backgroundColor.slice(
        1
      )}`;
    } else {
      profilePicUrl = getProfilePicture();
    }

    setProfilePicUrl(profilePicUrl);
  }, [publicKey, groupChat]);

  const getProfilePicture = () => {
    if (!publicKey) {
      return DEFAULT_PROFILE_PIC_URL;
    }
    return buildProfilePictureUrl(publicKey, {
      fallbackImageUrl: `${window.location.href}${DEFAULT_PROFILE_PIC_URL}`,
    });
  };

  if (!profilePicUrl) {
    return <></>;
  }

  return (
    <ConditionalLink
      className={`block ${classNames}`}
      style={{
        width: `${diameter}px`,
        maxWidth: `${diameter}px`,
        minWidth: `${diameter}px`,
      }}
      href={getProfileURL(username)}
      condition={!!username}
      target="_blank"
      onClick={(e) => e.stopPropagation()}
    >
      <img
        src={profilePicUrl}
        style={{ height: `${diameter}px`, width: `${diameter}px` }}
        className={`w-12 h-12 bg-white bg-no-repeat bg-center bg-cover rounded-full ${borderColor}`}
        alt={publicKey}
        title={publicKey}
        onError={() => {
          setProfilePicUrl(DEFAULT_PROFILE_PIC_URL);
        }}
      />
    </ConditionalLink>
  );
};
