async function postData(bodyData, fullURL){
    fetch(fullURL,{
        method: 'POST',
        // mode:'no-cors',
        // cache: 'no-cache',
        // credentials:'omit',
        // headers:{
        //     'Content-Type':'application/json'
        // },
        // redirect:'follow',
        body: JSON.stringify(bodyData)
    })
    .then(res => res.json())
    .then(data =>{
        //document.getElementById("postResults").innerText = JSON.stringify(data);
        console.log(data)
    })
}
        
async function getData(fullURL){
    //let getGas = await fetch('https://script.google.com/macros/s/AKfycby0v1XvjKK5AMID7Y-TyQz_mzB-Jw2eHmqI4lLnqep7vLPcN9QtK84p7devc3-d8yJhWw/exec')
    //console.log(getGas)
    const results = await fetch(fullURL)
    .then(res => res.json())
    .then(data =>{  
        console.log(data)
        return data;
    })
    return results;
}    