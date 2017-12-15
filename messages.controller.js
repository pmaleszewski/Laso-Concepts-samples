'use strict'

const responses = require('../models/responses')
const messageService = require('../services/messages.service')
const profileService = require('../services/profiles.service')
const locationsService = require('../services/locations.service')
const institutionsService = require('../services/institutions.service')
const notificationsAppService = require('../services/notifications-app.service')
const apiPrefix = '/api/messages'

module.exports = {
    readAll: _readAll,
    readById: _readById,
    readMyChannels: _readMyChannels,
    create: _create,
    update: _update,
    delete: _delete
}

function _readAll(req, res) {
    let readAll = messageService.readAll

    if (req.query.institutionId) {
        readAll = messageService.readByClientInstitutionId
    }
    else if (req.query.senderProfileId) {
        req.query.receiverProfileId = req.auth.profileId
        readAll = messageService.readBySenderId
    }
    readAll(req.query)
        .then(messages => {
            const responseModel = new responses.ItemsResponse()
            responseModel.items = messages
            res.json(responseModel)
        })
        .catch(err => {
            console.log(err)
            res.status(500).send(new responses.ErrorResponse(err))
        })
}

function _readById(req, res) {
    messageService.readById(req.params.id)
        .then(message => {
            if (!message) {
                res.status(404).send(new responses.ErrorResponse("Item does not exist."))
            }
            else {
                const responseModel = new responses.ItemResponse()
                responseModel.item = message
                res.json(responseModel)
            }
        })
        .catch(err => {
            console.log(err)
            res.status(500).send(new responses.ErrorResponse(err))
        })
}

function _readMyChannels(req, res) {
    const responseModel = new responses.ItemResponse()
    responseModel.item = []

    if (req.auth.profileType == 'super-admin') {
        res.json(responseModel)
    } else if (req.auth.profileType == 'mentor') {
        profileService.readById(req.auth.profileId)
            .then(profile => {
                const clientId = responseModel.item.clientId
                responseModel.item.push({ clientId: profile.menteeId })
                res.json(responseModel)
            })
            .catch(err => {
                console.log(err)
                res.status(500).send(new responses.ErrorResponse(err))
            })
    } else if (req.auth.profileType == 'institution-admin') {
        let institutionObj = {}

        profileService.readById(req.auth.profileId)
            .then(profile => {
                return institutionsService.readById(profile.institutionId)
            })
            .then(institution => {
                let currentInstitutionId = institution._id

                institutionObj.name = institution.name
                institutionObj.institutionId = currentInstitutionId

                return locationsService.readByInstitutionId(currentInstitutionId)
            })
            .then(locations => {
                for (var j = 0; j < locations.length; j++) {
                    let locationObj = {}
                    locationObj.name = locations[j].name
                    locationObj.institutionId = locations[j].institutionId
                    locationObj.locationId = locations[j]._id
                    responseModel.item.push(locationObj)
                }
                responseModel.item.unshift(institutionObj)
                res.json(responseModel)
            })
            .catch(err => {
                console.log(err)
                res.status(500).send(new responses.ErrorResponse(err))
            })
            .catch(err => {
                console.log(err)
                res.status(500).send(new responses.ErrorResponse(err))
            })
            .catch(err => {
                console.log(err)
                res.status(500).send(new responses.ErrorResponse(err))
            })
    } else if (req.auth.profileType == 'location-admin') {
        let institutionObj = {}

        profileService.readById(req.auth.profileId)
            .then(profile => {
                return locationsService.readById(profile.locationId)
            })
            .then(location => {
                location = location[0]
                let locationObj = {}
                locationObj.name = location.name
                locationObj.locationId = location._id
                responseModel.item.push(locationObj)
                return institutionsService.readById(location.institutionId)
            })
            .then(institution => {
                let currentInstitutionId = institution._id
                institutionObj.name = institution.name
                institutionObj.institutionId = currentInstitutionId

                responseModel.item.unshift(institutionObj)
                res.json(responseModel)
            })
            .catch(err => {
                console.log(err)
                res.status(500).send(new responses.ErrorResponse(err))
            })
            .catch(err => {
                console.log(err)
                res.status(500).send(new responses.ErrorResponse(err))
            })
            .catch(err => {
                console.log(err)
                res.status(500).send(new responses.ErrorResponse(err))
            })
    } else if (req.auth.profileType == 'client') {
        let clientObj = {}
        let activeLocationsArr = []

        profileService.readById(req.auth.profileId)
            .then(profile => {
                clientObj.clientId = profile._id
                return locationsService.readByLiveClientId(profile._id)
            })
            .then(locations => {
                for (var j = 0; j < locations.length; j++) {
                    let activeLocationsObj = {}
                    activeLocationsObj.name = locations[j].name
                    activeLocationsObj.locationId = locations[j]._id
                    activeLocationsObj.institutionId = locations[j].institutionId
                    activeLocationsArr.push(activeLocationsObj)
                }
                return institutionsService.readByIds(activeLocationsArr)
            })
            .then(institution => {
                for (var i = 0; i < institution.length; i++) {
                    let institutionObj = {}
                    institutionObj.name = institution[i].name
                    institutionObj.institutionId = institution[i]._id
                    responseModel.item.unshift(institutionObj)
                }

                for (var x = 0; x < activeLocationsArr.length; x++) {
                    let location = activeLocationsArr[x]
                    const index = responseModel.item.findIndex(obj => obj.institutionId == location.institutionId)
                    responseModel.item.splice(index + 1, 0, location)
                }
                responseModel.item.unshift(clientObj)
                res.json(responseModel)
            })
            .catch(err => {
                console.log(err)
                res.status(500).send(new responses.ErrorResponse(err))
            })
            .catch(err => {
                console.log(err)
                res.status(500).send(new responses.ErrorResponse(err))
            })
            .catch(err => {
                console.log(err)
                res.status(500).send(new responses.ErrorResponse(err))
            })
    }
}

function _create(req, res) {
    req.model.profileId = req.auth.profileId;
    if (req.model.content && req.model.tags || req.model.mentions) {
        let tags = req.model.content.match(/#\w+/g)
        if (tags) {
            let newTags = tags.map((hashtag) => { return hashtag.substr(1) })
            req.model.tags.push.apply(req.model.tags, newTags)
        }
        let mentions = req.model.content.match(/@\w+/g)
        if (mentions) {
            let newMentions = mentions.map((mention) => { return mention.substr(1) })
            req.model.mentions.push.apply(req.model.mentions, newMentions)
        }
    } else if (req.model.content) {
        let tags = req.model.content.match(/#\w+/g)
        if (tags) {
            req.model.tags = tags.map((hashtag) => { return hashtag.substr(1) })
        }
        let mentions = req.model.content.match(/@\w+/g)
        if (mentions) {
            req.model.mentions = mentions.map((mention) => { return mention.substr(1) })
        }
    }
    if (req.model.destination.type == 'direct') {
        var recieverId = req.model.destination.id
        var senderId = req.model.profileId
    }
    messageService.create(req.model)
        .then(id => {
            if (recieverId && senderId) {
                notificationsAppService.notifyDirectMessageSend(recieverId, senderId).catch(err => console.log(err))
            }
            const responseModel = new responses.ItemResponse()
            responseModel.item = id
            res.status(201)
                .location(`${apiPrefix}/${id}`)
                .json(responseModel)
        })
        .catch(err => {
            console.log(err)
            res.status(500).send(new responses.ErrorResponse(err))
        })
}

function _update(req, res) {
    if (req.model.content && req.model.tags || req.model.mentions) {
        let tags = req.model.content.match(/#\w+/g)
        if (tags) {
            let newTags = tags.map((hashtag) => { return hashtag.substr(1) })
            req.model.tags.push.apply(req.model.tags, newTags)
        }
        let mentions = req.model.content.match(/@\w+/g)
        if (mentions) {
            let newMentions = mentions.map((mention) => { return mention.substr(1) })
            req.model.mentions.push.apply(req.model.mentions, newMentions)
        }
    } else if (req.model.content) {
        let tags = req.model.content.match(/#\w+/g)
        if (tags) {
            req.model.tags = tags.map((hashtag) => { return hashtag.substr(1) })
        }
        let mentions = req.model.content.match(/@\w+/g)
        if (mentions) {
            req.model.mentions = mentions.map((mention) => { return mention.substr(1) })
        }
    }
    messageService
        .update(req.model)
        .then(message => {
            const responseModel = new responses.SuccessResponse()
            res.status(200).json(responseModel)
        })
        .catch(err => {
            console.log(err)
            res.status(500).send(new responses.ErrorResponse(err))
        })
}

function _delete(req, res) {
    messageService.deactivate(req.params.id)
        .then(id => {
            const responseModel = new responses.ItemResponse()
            responseModel.item = id
            res.status(201)
                .location(`${apiPrefix}/${id}`)
                .json(responseModel)
        })
        .catch(err => {
            console.log(err)
            res.status(500).send(new responses.ErrorResponse(err))
        })
}
