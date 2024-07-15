import * as utils from "./utils";
let string = '['
for (let i=0;i<10000;i++){
    let wallet = utils.generateNewWallet()
    string = string + wallet.address;
    if (i != 9999) {
        string = string + ', '
    }
}
string += ']';
console.log(string)