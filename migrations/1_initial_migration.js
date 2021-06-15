const Migrations = artifacts.require("Migrations");

// trick to be compatible with waffle build
Migrations._json.contractName = "Migrations";
Migrations._properties.contract_name.get = () => "Migrations";
Migrations._properties.contractName.get = () => "Migrations";

module.exports = function (deployer) {
  deployer.deploy(Migrations);
};
