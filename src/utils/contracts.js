import {state} from "../state.js";
import Vue from 'vue';

const ethers = require('ethers');
const registryContract = require('../../build/contracts/ClauseRegistry.json');
const disputeManagerContract = require('../../build/contracts/DisputeManager.json');
const impactInvestmentContract = require('../../build/contracts/ImpactInvestment.json');
const fundingContract = require('../../build/contracts/OpenFunding.json');

const AUTHOR = '0x0432043bE8CAbbA7df8759d6E9cE8Aa5Fcc4B009';

//TODO: Replace with own ganache address
const ARBITER = '0xCa9267EC6C6a127606A047c2cf2D152E6fE387A1';

const REGISTRY_ADDRESS= '0x4e0D6436f82c9D7B17c4f62d30c615Dd7756471D';
const FUNDING_ADDRESS = '0x2f106A81d1fD5BED5bBF8b03C425E013CD277323';
const CONTRACT_ADDRESS = '0xb0899fedB841476A928d76b6B78635687B376f2A';

var provider, signer, impactContract, registry, fundingClause, disputeManager;

const injectedWeb3 = window.web3;
if (typeof injectedWeb3 !== "undefined") {
  provider = new ethers.providers.Web3Provider(injectedWeb3.currentProvider);
  console.log(provider);
  signer = provider.getSigner();
} else {
  console.log("No web3 provider available");
}

export const contracts = {
  deployClausesRegistry: async function() {
    let registryFactory = new ethers.ContractFactory(registryContract.abi, registryContract.bytecode, signer);
    registry = await registryFactory.deploy();
    console.log('Clauses registry deployed: ' + registry.address)
  },
  deployFundingClause: async function() {
    let fundingFactory = new ethers.ContractFactory(fundingContract.abi, fundingContract.bytecode, signer);
    fundingClause = await fundingFactory.deploy();
    await registry.registerClause(fundingClause.address, AUTHOR, 100, 25);
    console.log('Funding clause deployed: ' + fundingClause.address);
  },
  init: function() {
    registry = new ethers.Contract(REGISTRY_ADDRESS, registryContract.abi, signer);
    fundingClause = new ethers.Contract(FUNDING_ADDRESS, fundingContract.abi, signer);
    impactContract = new ethers.Contract(CONTRACT_ADDRESS, impactInvestmentContract.abi, signer);

    console.log('Clauses registry linked: ' + registry.address);
    console.log('Funding clause linked: ' + fundingClause.address);
    console.log('Impact contract linked: ' + impactContract.address);
  },
  deployLegalContract: async function() {
    let impactContractFactory = new ethers.ContractFactory(impactInvestmentContract.abi, impactInvestmentContract.bytecode, signer);
    impactContract = await impactContractFactory.deploy(registry.address, fundingClause.address, ARBITER, ['MAX_DONATION'], [20]);

    console.log('Impact contract deployed: ' + impactContract.address);
  },
  fund: async function(amount) {
    await this.fetchState();
    let before = state.contract.successes;
    await impactContract.fund(amount, {value: 125});
    await this.fetchState();
    return (state.contract.successes > before);
  },
  fetchState: async function() {
    state.contract.funded = await impactContract.funded();
    let result = await registry.getStats(fundingClause.address);
    state.contract.failures = result.failure;
    state.contract.successes = result.success;
    state.contract.min = await impactContract.getValue('MIN_DONATION');
    state.contract.max = await impactContract.getValue('MAX_DONATION');

    console.log("Funded: " + state.contract.funded);
    console.log("Failures: " + state.contract.failures);
    console.log("Succeses: " + state.contract.successes);
    console.log("MIN: " + state.contract.min);
    console.log("MAX: " + state.contract.max);
  },
  fetchExceptions: async function() {
    let dmAddress = await impactContract.disputeManager();
    disputeManager = new ethers.Contract(dmAddress, disputeManagerContract.abi, signer);

    let arbiter = await impactContract.getRole('ARBITER');
    let currentAccount = await signer.getAddress();

    state.exceptions.length = 0;
    let count = (await disputeManager.getDisputesCount()).valueOf();
    for(var i=0; i<count; i++) {
      let exception = await disputeManager.getDispute(i);
      state.exceptions.push({
        id: i,
        clause: 'Funding',
        value: parseInt('0x'+exception[1].substring(10)),
        resolved: exception[2],
        canResolve: arbiter === currentAccount
      })
    }

    console.log("Arbiter: " + arbiter);
    console.log("Current: " + currentAccount);
    console.log(count);
  },
  resolve: async function(index) {
    console.log("Resolving: " + index);
    await impactContract.appeal(index);

    await this.fetchExceptions();
    await this.fetchState();
  }

  // deployCatalog: async function() {
  //   let factory = new ethers.ContractFactory(catalogContract.abi, catalogContract.bytecode, signer);
  //   let contract = await factory.deploy();
  //   console.log(contract.address);
  // },
  // deployProject: async function() {
  //   let factory = new ethers.ContractFactory(projectContract.abi, projectContract.bytecode, signer);
  //
  //   //constructor(string memory _name, uint8 _upfrontPaymentPercentage, uint256 _couponNominalPrice, uint256 _couponInterestRate) public
  //   let contract = await factory.deploy('UNEMPLOYMENT', 0, 1, 15);
  //   console.log(contract.address);
  //   await contract.setToken("0x0d694e6d4310b10830abe7d5CFfde8b4Bf267B40");
  //   await contract.setBeneficiary(contract.address);
  //   await this.registerProject(contract.address);
  // },
  // deployDemoToken: async function() {
  //   let factory = new ethers.ContractFactory(demoTokenContract.abi, demoTokenContract.bytecode, signer);
  //   let contract = await factory.deploy();
  //   console.log(contract.address);
  // },
  // deployDemoWallet: async function() {
  //   let factory = new ethers.ContractFactory(demoWalletContract.abi, demoWalletContract.bytecode, signer);
  //   let contract = await factory.deploy(CATALOG_ADDRESS);
  //   console.log("Created wallet: " + contract.address);
  //   this.fetchWallet();
  // },
  // deposit: async function(amount) {
  //   console.log("DEPOSITING " + amount + " tokens to wallet: " + walletAddress);
  //   let walletContract = new ethers.Contract(walletAddress, demoWalletContract.abi, signer);
  //   await walletContract.requestTokens(DEMO_TOKEN_ADDRESS, amount);
  //   this.updateBalance();
  // },
  // invest: async function(project, amount) {
  //   console.log("Investing into project: " + project);
  //   let walletContract = new ethers.Contract(walletAddress, demoWalletContract.abi, signer);
  //   await walletContract.invest(amount, "UNEMPLOYMENT");
  //   await projects.fetchProjects();
  //   await this.updateBalance();
  // },
  // updateBalance: async function() {
  //   console.log("Checking balance for: " + walletAddress);
  //   let tokenContract = new ethers.Contract(DEMO_TOKEN_ADDRESS, demoTokenContract.abi, signer);
  //   let balance = await tokenContract.balanceOf(walletAddress);
  //   state.balance.value = balance.valueOf();
  // },
  // registerProject: async function(address) {
  //   let projectInstance = new ethers.Contract(address, projectContract.abi, signer);
  //   let name = await projectInstance.name();
  //   console.log("Registering project: " + name);
  //
  //   let contract = new ethers.Contract(CATALOG_ADDRESS, catalogContract.abi, signer);
  //   await contract.addProject(name, PROJECT_ADDRESS);
  //   let added = await contract.getProjectAddress(name);
  //   console.log("Project added: " + added);
  // },
  // fetchProjects: async function() {
  //   console.log("Fetching projects");
  //   state.projects.length = 0;
  //   let eventAbi = [catalogContract.abi[4]];
  //   let iface = new ethers.utils.Interface(eventAbi);
  //
  //   let filter = {
  //     address: CATALOG_ADDRESS,
  //     fromBlock: 0
  //   };
  //
  //   provider.getLogs(filter).then((results) => {
  //     console.log("RESULTS FROM FILTER");
  //     console.log(results);
  //
  //     results.forEach(async (result) => {
  //       let event = iface.parseLog(result);
  //       let address = event.values[1];
  //       let contract = new ethers.Contract(address, projectContract.abi, signer);
  //       let code = await contract.name();
  //       let interests = await contract.couponInterestRate();
  //
  //       //Fetch coupon holdings
  //       let couponAddress = await contract.getCoupon();
  //       let coupon = new ethers.Contract(couponAddress, couponContract.abi, signer);
  //       let holdings = await coupon.balanceOf(walletAddress);
  //
  //       let project = {
  //         code: code,
  //         desc: state.projectDesc[code],
  //         contract: contract,
  //         interests: interests + '%',
  //         holdings: holdings.valueOf()
  //       };
  //       state.projects.push(project);
  //     });
  //   });
  // },
  // fetchWallet: async function() {
  //   let address = await signer.getAddress();
  //
  //   let filter = {
  //     fromBlock: 0,
  //     topics: [
  //       "0x234cf33b32239d80b54161e2396c80cdeaf4d34161300e54d8bc01eb7c0ea553",
  //       "0x000000000000000000000000" + address.substr(2)
  //     ]
  //   };
  //
  //   provider.getLogs(filter).then((results) => {
  //     if (results.length > 0) {
  //       walletAddress = results[0].address;
  //       state.wallet.active = true;
  //       this.updateBalance();
  //       this.fetchProjects();
  //     }
  //   });
  // }

};
contracts.init();
contracts.fetchState();

