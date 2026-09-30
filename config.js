const fs = require("fs");

function getEnvironment(){

    if(!fs.existsSync("appsettings.json")){

        fs.writeFileSync(
            "appsettings.json",
            JSON.stringify(
                {
                    environment: "PROD"
                },
                null,
                4
            )
        );

        return "PROD";
    }

    const settings = JSON.parse(
        fs.readFileSync(
            "appsettings.json",
            "utf8"
        )
    );

    return settings.environment || "PROD";
}

module.exports = {
    getEnvironment
};