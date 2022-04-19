import { useState, useEffect } from 'react';
import { useMetamask } from "../../hooks/useMetamask";
import axios from 'axios';
import Solana from './Solana';
import Ethereum from './Ethereum';
import Missing from './Missing';
import RetweetLanding from './RetweetLanding';
import { useRouter } from 'next/router';
import { useTwitter } from '../../hooks/useTwitter';
import { useSignMessage, useAccount } from "wagmi";

export default function ContentLanding({ loading, fileInfo, missing }) {
  const [signing, setSigning] = useState(false);
  const [gallery, setGallery] = useState(false);
  const [fullResponse, setFullResponse] = useState(null);
  const [offset, setOffset] = useState(0);
  const [limit] = useState(50);
  const [verifying, setVerifying] = useState(false);

  const [{ data: accountData, error: accountError, loading: accountLoading }, disconnect] = useAccount()

  const { verifyRetweet } = useTwitter();
  const router = useRouter();

  useEffect(() => {
    const { oauth_token, oauth_verifier } = router.query;    
    if(oauth_token && oauth_verifier) {
      setVerifying(true);
      handleVerification(oauth_token, oauth_verifier);      
    }
  }, [router.query]);

  const handleVerification = async (oauth_token, oauth_verifier) => {
    try {      
      const res = await verifyRetweet(oauth_token, oauth_verifier);   
      if(res && !res.directory) {
        setVerifying(false);
        window.location.replace(`${res.gateway}/ipfs/${res.cid}?accessToken=${res.token}`);
      } else if(res && res.html) {
        setVerifying(false);
        window.location.replace(`${res.gateway}/ipfs/${res.cid}/index.html?accessToken=${res.token}`);
      } else {
        setFullResponse(res);
        setOffset(0);
        setGallery(true);
        router.push(window.location.pathname.split("/")[1].split("?")[0]);
      }    
    } catch (error) {
      alert(error.response.data);
      router.push(window.location.pathname.split("/")[1].split("?")[0]);      
    }        
  }

  const { signData, ethereum, setEthereum } = useMetamask();
  const [{ data: signingData, error: signingError, loading:signmessageLoading }, signMessage] =
  useSignMessage();

  const handleSign = async () => {    
    try {
      setSigning(true);
      if(fileInfo.unlockInfo.blockchain === "Solana") {
        const url = await signDataSol(fileInfo);
        if(url) {
          setSigning(false);
          window.location.replace(url);
        } 
      } else {
        const { shortId, submarineCID, unlockInfo } = fileInfo;
        const { contract, blockchain, tokenId, network } = unlockInfo;
        const messageToSign = await axios.get(`/api/verify?contract=${contract}`);
        const messageData = `To verify you own the NFT in question,
you must sign this message. 
The NFT contract address is:
${messageToSign.data.contract}
The verification id is: 
${messageToSign.data.id}`

        const {data: signature} = await signMessage({ message: messageData });

        const verificationResponse = await axios.post("/api/verify", {
          address: accountData.address,
          signature,
          network,
          contractAddress: contract,
          blockchain, 
          tokenId,
          CID: submarineCID,
          shortId: shortId
        });

        const res = verificationResponse.data;
        if(res && !res.directory) {
          setSigning(false);
          window.location.replace(`${res.gateway}/ipfs/${res.cid}?accessToken=${res.token}`);
        } else if(res && res.html) {
          setSigning(false);
          window.location.replace(`${res.gateway}/ipfs/${res.cid}/index.html?accessToken=${res.token}`);
        } else {
          setFullResponse(res);
          setOffset(0);
          setGallery(true);
        }
      }          
    } catch (error) {
      setSigning(false)
      alert(error.message)
    }    
  }

  const handleChangePage = async (dir) => { 
    let newOffset;   
    if(dir === "forward") {
      newOffset = offset + limit;      
      setOffset(newOffset);      
    } else {
      newOffset = offset - limit;
      if(newOffset < 0) {
        setOffset(0);   
        newOffset = 0;
      } else {
        setOffset(newOffset);
      }           
    }

    const res = await axios.post(`/api/content`, {
      accessToken: fullResponse.token, 
      gatewayURL: `${fullResponse.gateway}${fullResponse.childContent[0].uri}`, 
      offset: newOffset, 
      shortId: window.location.pathname.split("/")[1]
    });

    if(res.data.childContent.length === 0) {
      setOffset(newOffset - limit);
    } else {
      setFullResponse(res.data);
    }    
  }

  return (
    <div>
      {
        missing ? 
        <Missing /> :     
        <div>
{
        fileInfo && fileInfo.unlockInfo && fileInfo.unlockInfo.type === "retweet" ? 
        <RetweetLanding verifying={verifying} handleChangePage={handleChangePage} setGallery={setGallery} setFullResponse={setFullResponse} fullResponse={fullResponse} gallery={gallery} fileInfo={fileInfo} loading={loading} /> :
        fileInfo && fileInfo.unlockInfo && fileInfo.unlockInfo.blockchain && fileInfo.unlockInfo.blockchain === "Solana" ? 
        <Solana handleChangePage={handleChangePage} setGallery={setGallery} setFullResponse={setFullResponse} fullResponse={fullResponse} gallery={gallery} fileInfo={fileInfo} loading={loading} signing={signing} handleSign={handleSign} /> : 
        <Ethereum ethereum={ethereum} setEthereum={setEthereum} handleChangePage={handleChangePage} fullResponse={fullResponse} gallery={gallery} fileInfo={fileInfo} loading={loading} signing={signing} handleSign={handleSign} />
      }
        </div>
      }
      
    </div>
  );
}
