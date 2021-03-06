import axios from "axios";

export const getSubmarinedContent = async (pinata_submarine_key, submarine_cid, pinata_gateway_subdomain, offset = 0) => {
  try {
    const config = {
      headers: {
        "x-api-key": `${pinata_submarine_key}`,
        "Content-Type": "application/json",
      },
    };
    const content = await axios.get(
      `${process.env.NEXT_PUBLIC_MANAGED_API}/content?cidContains=${submarine_cid}`,
      config
    );

    const { data } = content;     
    const { items } = data;
    const item = items.find((i) => i.cid === submarine_cid);

    let hasIndexHtml = false;
    let childContent = []
    let totalChildContentItems = 0;
    if(item.type === 'D') {
      const listData = await axios.get(`${process.env.NEXT_PUBLIC_MANAGED_API}/content/${item.id}/list?includePaths=true&limit=10&offset=${offset}`, config)          
      totalChildContentItems = listData.data.totalItems;
      const { items: directoryItems } = listData.data;
      const indexHtml = directoryItems.filter(i => i.originalname.includes("index.html"));
      hasIndexHtml = indexHtml.length > 0;
      childContent = directoryItems;
    }
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
    return {
      directory: item.type === 'D' ? true : false, 
      html: hasIndexHtml, 
      token: token.data, 
      gateway: GATEWAY_URL, 
      cid: submarine_cid, 
      childContent, 
      totalItems: totalChildContentItems, 
      itemId: item.id
    }
  } catch (error) {
    throw error;
  }
}