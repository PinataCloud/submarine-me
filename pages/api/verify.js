import axios from "axios";
import { ethers } from "ethers";
import { verifyMessage } from 'ethers/lib/utils'
import { v4 as uuidv4 } from "uuid";
import { withIronSession } from "next-iron-session";
import * as util from "ethereumjs-util";
import { json } from "../../erc721";
import { erc1155 } from "../../erc1155";
import { getUserContentCombo } from "../../helpers/verify.helpers";
import { getSubmarinedContent } from "../../helpers/submarine";
import { Sentry } from "../../helpers/sentry";

function withSession(handler) {
  return withIronSession(handler, {
    password: process.env.SECRET_COOKIE_PASSWORD,
    cookieName: "web3-auth-session",
    cookieOptions: {
      secure: process.env.NODE_ENV === "production" ? true : false,
    },
  });
}

async function checkErc721Balance(contract, address) {
  try {
    const balance = await contract.balanceOf(address);
    return balance;
  } catch (error) {
    // console.log(error);
    return null;
  }
}

async function checkErc1155Balance(contract, address, tokenId) {
  try {
    const balance = await contract.balanceOf(address, tokenId);
    return balance
  } catch (error) {
    console.log(error);
    return null;
  }
}

export default withSession(async (req, res) => {
  if (req.method === "POST") {
    try {
      const {
        network,
        contractAddress,
        CID,
        address,
        signature,
        shortId,
        blockchain,
        tokenId,
      } = req.body;
      const networkMap = {
        "ETH - Mainnet": process.env.ALCHEMY_MAINNET,
        "ETH - Ropsten": process.env.ALCHEMY_ROPSTEN,
        "ETH - Rinkeby": process.env.ALCHEMY_RINKEBY,
        "Polygon - Mainnet": process.env.ALCHEMY_POLYGON,
        "Polygon - Mumbai": process.env.ALCHEMY_MUMBAI,
        Ethereum: {
          Mainnet: process.env.ALCHEMY_MAINNET,
          Rinkeby: process.env.ALCHEMY_RINKEBY,
        },
        Polygon: {
          Mainnet: process.env.ALCHEMY_POLYGON,
          Mumbai: process.env.ALCHEMY_MUMBAI,
        },
        Avalanche: {
          Mainnet: process.env.AVAX_MAIN,
          Fuji: process.env.AVAX_TEST,
        },
      };

      const message = req.session.get("message-session");
      const rpc =
        blockchain && network
          ? networkMap[blockchain][network]
          : networkMap[network];
      const provider = await new ethers.providers.JsonRpcProvider(rpc);
      let contract = await new ethers.Contract(
        contractAddress,
        json(),
        provider
      );
      const fullMessage = `To verify you own the NFT in question,
you must sign this message. 
The NFT contract address is:
${contractAddress}
The verification id is: 
${message.id}`;
        const recoveredAddress = verifyMessage(fullMessage, signature);

      if (address === recoveredAddress) {
        let balance = await checkErc721Balance(contract, recoveredAddress);
        if(balance && tokenId) {
          const owner = await contract.ownerOf(tokenId);        
          if(owner.toString().toLowerCase() !== recoveredAddress.toLowerCase()) {
            return res.status(401).send(`Token ID ${tokenId} not owned by ${address}`);
          }
        }
        if(!balance) {  
          contract = await new ethers.Contract(
            contractAddress,
            erc1155(),
            provider
          );        
          balance = await checkErc1155Balance(contract, recoveredAddress, tokenId);
        }        
        
        if (balance && balance.toString() !== "0") {
          const info = await getUserContentCombo(shortId);
          const { submarine_cid } = info;
          const { pinata_submarine_key, pinata_gateway_subdomain } = info.Users;
          const responseObj = await getSubmarinedContent(pinata_submarine_key, submarine_cid, pinata_gateway_subdomain);
          return res.json(
           responseObj
          );
        } else {
          return res.status(401).send("Token not found. Check your network.");
        }
      } else {
        return res.status(401).send("Invalid signature");
      }
    } catch (error) {
    
      console.log(error);
      console.log(error.response);
      return res.status(500).json(error);
    }
  } else if (req.method === "GET") {
    try {
      const message = { contract: req.query.contract, id: uuidv4() };
      req.session.set("message-session", message);
      await req.session.save();
      return res.json(message);
    } catch (error) {
      console.log(error);
      const { response: fetchResponse } = error;
      Sentry.captureException(error);
      return res.status(fetchResponse?.status || 500).json(error.data);
    }
  } else {
    return res.status(200).json({
      message: "This is the way...wait, no it is not. What are you doing here?",
    });
  }
});
