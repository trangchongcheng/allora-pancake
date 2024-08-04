import { Web3 } from "web3";
import config from "./config";
const fs = require("fs");

const abiContent = JSON.parse(fs.readFileSync("./abi.json", "utf8"));
const web3 = new Web3("https://arb1.arbitrum.io/rpc");

const contractAddress = "0x1cdc19b13729f16c5284a0ace825f83fc9d799f4";
const contract = new web3.eth.Contract(abiContent, contractAddress);

const { bettingValues, wallets } = config;

const main = async () => {
  let totalBalance = 0;
  console.log(
    `\n========================  STARTING ========================\n`
  );
  for (let index = 0; index < wallets.length; index++) {
    const wallet = wallets[index];
    const { privatekey, type, name } = wallet;

    console.log(`\nNick ${index + 1} - Name: ${name}`);
    try {
      const account = web3.eth.accounts.privateKeyToAccount(`0x${privatekey}`);
      const address = account.address;
      const curentBalance = await getBalance(address);
      if (curentBalance < 0.001) {
        console.log(`\nSố dư trong ví còn quá ít, số dư: ${curentBalance}`);
      } else {
        const betValueInWei = web3.utils.toWei(randomBettingValue(), "ether");
        const currentEpoch: any = await contract.methods.currentEpoch().call();

        // 1.Claim reward của epoch trước đó

        await claimEpoch(currentEpoch, privatekey, address);

        // 2.Kiểm tra epoch hiện tại có thể betting được không
        const isBet = await hasBet(currentEpoch, account.address);

        if (isBet) {
          console.log(`Bạn đã betting epoch ${currentEpoch} rồi`);
        } else {
          // 3. Betting
          let nonce = await web3.eth.getTransactionCount(
            account.address,
            "pending"
          );
          const gasPrice = await web3.eth.getGasPrice();

          const data =
            type === "bear"
              ? contract.methods.betBear(currentEpoch).encodeABI()
              : contract.methods.betBull(currentEpoch).encodeABI();

          const gasEstimate = await web3.eth.estimateGas({
            from: account.address,
            to: contractAddress,
            data,
            value: betValueInWei,
          });

          const txn = {
            to: contractAddress,
            data,
            gasLimit: gasEstimate,
            gasPrice: gasPrice + gasPrice / 5n,
            nonce,
            value: betValueInWei,
          };
          console.log(`Đang betting, epoch: ${currentEpoch}`);
          const signedTxn = await web3.eth.accounts.signTransaction(
            txn,
            privatekey
          );
          const txHash = await web3.eth.sendSignedTransaction(
            signedTxn.rawTransaction
          );
          console.log(
            `Betting thành công epoch: ${currentEpoch}, tx: ${txHash.transactionHash}`
          );
        }
        const curentBalance = await getBalance(address);
        console.log(`Số dư còn lại: ${curentBalance}`);
        totalBalance += curentBalance;
      }
    } catch (error: any) {
      console.log("Đã xảy ra lỗi, ", error);
    }
  }
  console.log(
    `\n\n==========> Tổng tiền còn lại: ${totalBalance} <==========\n`
  );
  console.log(
    `\n===================== END ${new Date().toLocaleTimeString()} =====================\n`
  );
};

const hasBet = async (epoch: any, address: string) => {
  try {
    const betInfo: any = await contract.methods.ledger(epoch, address).call();
    return betInfo[1] > 0;
  } catch (error) {
    console.log(`\nLỗi kiểm tra betting, epoch: ${epoch}: ${error}`);
    return false;
  }
};

const claimEpoch = async (
  currentEpoch: any,
  privatekey: string,
  address: string
) => {
  for (let epoch = currentEpoch - 5n; epoch < currentEpoch; epoch++) {
    const claimable = await contract.methods.claimable(epoch, address).call();
    if (claimable) {
      console.log(`Đang claim reward epoch ${epoch}`);
      try {
        const gasEstimate = await web3.eth.estimateGas({
          from: address,
          to: contractAddress,
          data: contract.methods.claim([epoch]).encodeABI(),
        });
        let nonce = await web3.eth.getTransactionCount(address, "pending");
        const gasPrice = await web3.eth.getGasPrice();

        const txn = {
          to: contractAddress,
          data: contract.methods.claim([epoch]).encodeABI(),
          gas: gasEstimate,
          gasPrice: gasPrice + gasPrice / 5n,
          nonce,
        };
        const signedTxn = await web3.eth.accounts.signTransaction(
          txn,
          privatekey
        );
        const txHash = await web3.eth.sendSignedTransaction(
          signedTxn.rawTransaction
        );
        console.log(
          `Claim thành công reward epoch: ${epoch}, tx: ${txHash.transactionHash}`
        );
      } catch (error) {
        console.error(`\nLỗi khi claim reward ở epoch ${epoch}: ${error}`);
      }
    }
  }
};

const getBalance = async (address: string) => {
  const balance = await web3.eth.getBalance(address);
  const balanceInWei = web3.utils.fromWei(balance, "ether");
  const balanceParse = Number(balanceInWei);
  return balanceParse;
};

const randomBettingValue = () => {
  const randomIndex = Math.floor(Math.random() * bettingValues.length);
  return bettingValues[randomIndex];
};
setInterval(main, 6 * 59 * 1000);
