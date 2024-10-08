import axios from "axios";

interface MinecraftProfile {
  id: string;
  name: string;
  properties: Array<{
    name: string;
    value: string;
  }>;
  metadata?: {
    [key: string]: any;
  };
}

export async function GET(request: Request) {
  const urlParams = new URLSearchParams(new URL(request.url).search);
  const query = urlParams.get("player");

  if (!query) {
    return error("No valid player name/UUID or none provided");
  }

  try {
    let skinUrl: string;

    if (isMinecraftUsername(query)) {
      const uuidResponse = await getUUIDByUsername(query);

      if (uuidResponse.error) {
        return uuidResponse.error;
      }

      skinUrl = await getMinecraftSkin(uuidResponse.id);
    } else if (isMinecraftUUID(query)) {
      skinUrl = await getMinecraftSkin(query);
    } else {
      return error("Invalid player name/UUID format");
    }

    return await fetchImage(skinUrl);
  } catch (err) {
    console.error("Error processing request:", err);
    return error("An error occurred while processing the request");
  }
}

function isMinecraftUsername(str: string): boolean {
  const usernameRegex = /^[a-zA-Z0-9_]{3,16}$/;
  return usernameRegex.test(str);
}

function isMinecraftUUID(str: string): boolean {
  const uuidWithHyphensRegex =
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  const uuidWithoutHyphensRegex = /^[0-9a-fA-F]{32}$/;
  return uuidWithHyphensRegex.test(str) || uuidWithoutHyphensRegex.test(str);
}

function error(message: string): Response {
  return new Response(message, { status: 400 });
}

async function getUUIDByUsername(
  username: string
): Promise<{ id: string; error: null } | { id: null; error: Response }> {
  try {
    const response = await axios.post(
      "https://api.minecraftservices.com/minecraft/profile/lookup/bulk/byname",
      [username]
    );

    if (response.data && response.data[0] && response.data[0].id) {
      return {
        id: response.data[0].id,
        error: null,
      };
    }

    return {
      id: null,
      error: new Response("Player not found", { status: 404 }),
    };
  } catch (error) {
    console.error("Error fetching UUID:", error);
    return {
      id: null,
      error: new Response("An error occurred while fetching UUID", {
        status: 400,
      }),
    };
  }
}

async function getMinecraftSkin(uuid: string): Promise<string> {
  const url = `https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`;

  try {
    const response = await axios.get<MinecraftProfile>(url);
    const profile = response.data;

    const skinProperty = profile.properties.find(
      (prop) => prop.name === "textures"
    );

    if (skinProperty) {
      const decodedValue = JSON.parse(atob(skinProperty.value));

      if (decodedValue.textures.SKIN) {
        return decodedValue.textures.SKIN.url;
      } else {
        return determineDefaultSkin(uuid);
      }
    } else {
      return determineDefaultSkin(uuid);
    }
  } catch (error) {
    console.error("Error fetching Minecraft profile:", error);
    return determineDefaultSkin(uuid);
  }
}

function determineDefaultSkin(uuid: string): string {
  if (uuid.length <= 16) {
    return "/assets/steve.png";
  } else {
    const lsbs_even =
      parseInt(uuid[7], 16) ^
      parseInt(uuid[15], 16) ^
      parseInt(uuid[23], 16) ^
      parseInt(uuid[31], 16);
    return lsbs_even ? "/assets/alex.png" : "/assets/steve.png";
  }
}

async function fetchImage(url: string): Promise<Response> {
  try {
    const imageResponse = await axios.get(url, { responseType: "arraybuffer" });
    const contentType = imageResponse.headers["content-type"];

    return new Response(imageResponse.data, {
      headers: { "Content-Type": contentType },
    });
  } catch (error) {
    console.error("Error fetching image:", error);
    return new Response("Failed to fetch skin image", { status: 500 });
  }
}
