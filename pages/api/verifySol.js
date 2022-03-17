import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import { withIronSession } from "next-iron-session";
import { getUserContentCombo } from "../../helpers/verify.helpers";
import {
  getParsedNftAccountsByOwner,
} from "@nfteyez/sol-rayz";
import bs58 from "bs58";
import { sign } from "tweetnacl";
import { clusterApiUrl, Connection } from '@solana/web3.js';

function withSession(handler) {
  return withIronSession(handler, {
    password: process.env.SECRET_COOKIE_PASSWORD,
    cookieName: "web3-auth-session",
    cookieOptions: {
      secure: process.env.NODE_ENV === "production" ? true : false,
    },
  });
}

function createConnectionConfig (network, clusterApi = clusterApiUrl('mainnet-beta'), commitment = 'confirmed') {
  if(network === "Devnet") {
    clusterApi = clusterApiUrl("devnet");
  }
  return new Connection(clusterApi, commitment);
}

export default withSession(async (req, res) => {
  if (req.method === "POST") {
    try {
      const {
        network,
        updateAuthority,
        CID,
        address,
        signature,
        shortId,
        message,
        mintAddress
      } = req.body;

      const savedMessage = req.session.get("message-session");

      const signedMessage = new TextEncoder()
        .encode(`To verify you own the NFT in question,
you must sign this message. 
The NFT update authority address is:
${updateAuthority}
The verification id is: 
${savedMessage.id}`);

      if (message.id !== savedMessage.id) {
        return res.status(401).send(`Invalid signature attempt.`);
      }

      if (
        !sign.detached.verify(
          signedMessage,
          bs58.decode(signature),
          bs58.decode(address)
        )
      ) {
        return res
          .status(401)
          .send(`Invalid signature or NFT not owned by public key provided.`);
      }

      const nftArray = await getParsedNftAccountsByOwner({
        publicAddress: address,
        connection: createConnectionConfig(network)
      });      

      if (!nftArray || nftArray.length === 0) {
        return res.status(401).send("NFT not associated with your public key.");
      }

      let foundUpdateAuthority = nftArray.filter(
        (n) => n.updateAuthority === savedMessage.updateAuthority
      );

      if(mintAddress) {        
        let filteredByMintAddress = foundUpdateAuthority.filter(f => f.mint === mintAddress);
        foundUpdateAuthority = filteredByMintAddress;
      }

      if (!foundUpdateAuthority || foundUpdateAuthority.length === 0) {
        return res.status(401).send("NFT not associated with your public key.");
      }

      const info = await getUserContentCombo(shortId);
      const { pinata_submarine_key, pinata_gateway_subdomain } = info.Users;
      const config = {
        headers: {
          "x-api-key": `${pinata_submarine_key}`,
          "Content-Type": "application/json",
        },
      };
      const content = await axios.get(
        `${process.env.NEXT_PUBLIC_MANAGED_API}/content`,
        config
      );

      const { data } = content;
      const { items } = data;
      const item = items.find((i) => i.cid === CID);
      const body = {
        timeoutSeconds: 3600,
        contentIds: [item.id],
      };
      const token = await axios.post(
        `${process.env.NEXT_PUBLIC_MANAGED_API}/auth/content/jwt`,
        body,
        config
      );
      const GATEWAY_URL = `https://${pinata_gateway_subdomain}.${process.env.NEXT_PUBLIC_GATEWAY_ROOT}.cloud`;
      return res.send(
        `${GATEWAY_URL}/ipfs/${CID}?accessToken=${token.data}`
      );
    } catch (error) {
      console.log(error);
      console.log(error.response);
      res.status(500).json(error);
    }
  } else if (req.method === "GET") {
    try {
      const message = {
        updateAuthority: req.query.updateAuthority,
        id: uuidv4(),
      };
      req.session.set("message-session", message);
      await req.session.save();
      return res.json(message);
    } catch (error) {
      console.log(error);
      const { response: fetchResponse } = error;
      return res.status(fetchResponse?.status || 500).json(error.data);
    }
  } else {
    res.status(200).json({
      message: "This is the way...wait, no it is not. What are you doing here?",
    });
  }
});
