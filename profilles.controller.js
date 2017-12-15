'use strict'

const responses = require('../models/responses');
const profileService = require('../services/profiles.service')
const institutionService = require('../services/institutions.service')
const locationService = require('../services/locations.service')
const apiPrefix = '/api/profiles';
const emailsService = require('../services/emails.service')
const authorizationAppService = require('../services/authorization-app.service')
const crypto = require('crypto')
const notificationsAppService = require('../services/notifications-app.service')

module.exports = {
    readAll: readAll,
    readById: readById,
    readCurrent: readCurrent,
    readContacts: readContacts,
    readMyMentors: readMyMentors,
    create: create,
    update: update,
    delete: _delete,
    inviteMentor: _inviteMentor,
    mine: _mine,
    changeCurrentProfile: _changeCurrentProfile
}

function readAll(req, res) {
    let admin = null
    if (req.auth.profileType !== 'client' && req.auth.profileType !== 'mentor') {
        admin = true
    }
    profileService.readAll(null, req.query, admin)
        .then(profiles => {
            const responseModel = new responses.ItemsResponse()
            responseModel.items = profiles
            res.json(responseModel)
        })
        .catch(err => {
            console.log(err)
            res.status(500).send(new responses.ErrorResponse(err))
        });
}

function readMyMentors(req, res) {
    const menteeId = req.auth.profileId
    profileService.readByMenteeId(menteeId)
        .then(profiles => {
            const responseModel = new responses.ItemsResponse()
            responseModel.items = profiles
            res.json(responseModel)
        })
        .catch(err => {
            console.log(err)
            res.status(500).send(new responses.ErrorResponse(err))
        })
}

function readById(req, res) {
    let admin = null
    if (req.auth.profileType !== 'client' && req.auth.profileType !== 'mentor') {
        admin = true
    }
    profileService.readById(req.params.id, req.query.requestLocation, admin)
        .then(profile => {
            if (!profile) { res.status(404).send(new responses.ErrorResponse("Item Does Not Exist")) }
            else {
                const responseModel = new responses.ItemResponse()
                responseModel.item = profile
                res.json(responseModel)
            }
        })
        .catch(err => {
            console.log(err)
            res.status(500).send(new responses.ErrorResponse(err))
        })
}

function readCurrent(req, res) {
    profileService.readById(req.auth.profileId)
        .then(profile => {
            const responseModel = new responses.ItemResponse()
            responseModel.item = profile
            res.json(responseModel)
        })
        .catch(err => {
            console.log(err, "currentprofileError")
            res.status(500).send(new responses.ErrorResponse(err))
        })
}

function readContacts(req, res) {
    const responseModel = new responses.ItemResponse()
    responseModel.item = []
    let queryParams = { page: -1 }
    if (req.auth.profileType == 'super-admin') {
        profileService.readAll(null, queryParams)
            .then(profiles => {
                responseModel.item = profiles.profiles
                res.json(responseModel)
            })
            .catch(err => {
                console.log(err)
                res.status(500).send(new responses.ErrorResponse(err))
            })
    }
    else if (req.auth.profileType == 'mentor') {
        let clientId = {}
        let clientArr = []
        let locationArr = []
        let institutionObj = {}
        let firstContacts = []
        profileService.readById(req.auth.profileId, null, null)
            .then(profile => {
                clientId = profile.menteeId
                return profileService.readById(profile.menteeId)
            })
            .then(profile => {
                let emptyArr = []
                clientArr = emptyArr.concat(profile)
                return locationService.readByLiveClientId(clientId)
            })
            .then(locations => {
                for (var x = 0; x < locations.length; x++ ){
                    locationArr.push(locations[x]._id)
                    institutionObj = locations[x].institutionId
                }
                return profileService.readByLocationIds(locationArr)
            })
            .then(locationProfiles => {
                firstContacts = locationProfiles.concat(clientArr)
                return profileService.readByInstitutionId(institutionObj)  
            })
            .then(institutionProfiles => {
                responseModel.item = firstContacts.concat(institutionProfiles)
                res.json(responseModel)
            })
            .catch(err => {
                console.log(err)
                res.status(500).send(new responses.ErrorResponse(err))
            })
    }
    else if (req.auth.profileType == 'client') {
        let clientId = {}
        let newArr = []
        let locationArr = []
        let institutionObj = {}
        let mentorArr = []
        let firstContacts = []
        profileService.readById(req.auth.profileId)
        .then(profile => {
            clientId = profile._id
            return profileService.readByMenteeId(profile._id)
        })
        .then(mentors => {
            mentorArr = newArr.concat(mentors)
            return locationService.readByLiveClientId(clientId)
        })
        .then(locations => {
            for (var x = 0; x < locations.length; x++ ){
                locationArr.push(locations[x]._id)
                institutionObj = locations[x].institutionId
            }
            return profileService.readByLocationIds(locationArr)
        })
        .then(locationProfiles => {
            firstContacts = locationProfiles.concat(mentorArr)
            return profileService.readByInstitutionId(institutionObj)  
        })
        .then(institutionProfiles => {
            responseModel.item = firstContacts.concat(institutionProfiles)
            res.json(responseModel)
        })
        .catch(err => {
            console.log(err)
            res.status(500).send(new responses.ErrorResponse(err))
        })
    }
    else if (req.auth.profileType == 'institution-admin') {
        let firstContacts = []
        let allContacts = []
        let institutionIds = []
        let locationIds = []
        let clientIds = []
        let liveClients = []
        profileService.readById(req.auth.profileId)
            .then(profile => {
                return profileService.readByInstitutionId(profile.institutionId)
            })
            .then(institutionProfiles => {
                var instArr = []
                firstContacts = instArr.concat(institutionProfiles)
                for (var i = 0; i < institutionProfiles.length; i++) {
                    institutionIds.push(institutionProfiles[i].institutionId)
                }
                return locationService.readByInstitutionIds(institutionIds)
            })
            .then(locations => {
                for (var j = 0; j < locations.length; j++) {
                    locationIds.push(locations[j]._id)
                    liveClients = clientIds.concat(locations[j].liveClientIds)
                }
                return profileService.readByProfileIds(liveClients)
            })
            .then(clientProfiles => {
                allContacts = firstContacts.concat(clientProfiles)
                return profileService.readByLocationIds(locationIds)
            })
            .then(locationProfiles => {
                responseModel.item = locationProfiles.concat(allContacts)
                res.json(responseModel)
            })
            .catch(err => {
                console.log(err)
                res.status(500).send(new responses.ErrorResponse(err))
            })
    }
    else if (req.auth.profileType == 'location-admin') {
        let allContacts = []
        let locationIds = []
        let oneId = []
        let singleLocation = []
        let clientIds = []
        let liveClients = []
        let allLocationContacts = []
        let singleArr = []
        let institutionObj = {}
        profileService.readById(req.auth.profileId)
            .then(profile => {
                oneId.push(profile.locationId)
                return profileService.readByLocationIds(oneId)
            })
            .then(locations => {
                for (var j = 0; j < locations.length; j++) {
                    locationIds.push(locations[j]._id)
                    institutionObj = (locations[j].location.institutionId)
                    liveClients = clientIds.concat(locations[j].location.liveClientIds)
                }
                singleArr = singleLocation.concat(locations)
                return profileService.readByProfileIds(liveClients)
            })
            .then(clientProfiles => {
                allContacts = singleArr.concat(clientProfiles)
                return profileService.readByLocationIds(locationIds)
            })
            .then(locationProfiles => {
                allLocationContacts = locationProfiles.concat(allContacts)
                return profileService.readByInstitutionId(institutionObj)

            })
            .then(institutions => {
                responseModel.item = allLocationContacts.concat(institutions)
                res.json(responseModel)
            })
            .catch(err => {
                console.log(err)
                res.status(500).send(new responses.ErrorResponse(err))
            })
    }
}

function _changeCurrentProfile(req, res) {
    let cookie = req.cookies.auth
    cookie.profileId = req.model.id
    profileService.readById(req.model.id)
        .then(profile => {
            if (profile == null) {
                authorizationAppService.createCookies(res, cookie)
                const responseModel = new responses.SuccessResponse()
                res.status(200).json(responseModel)
            } else {
                if (profile.profileOverrides.name) { cookie.userDisplayName = profile.profileOverrides.name ? profile.profileOverrides.name : profile.user.defaultDisplayName }
                if (profile.isSuperAdmin) { cookie.profileType = "super-admin" }
                else if (profile.institutionId) { cookie.profileType = "institution-admin" }
                else if (profile.locationId) { cookie.profileType = "location-admin" }
                else if (profile.menteeId) { cookie.profileType = "mentor" }
                else { cookie.profileType = "client" }
                authorizationAppService.createCookies(res, cookie)
                const responseModel = new responses.SuccessResponse()
                res.status(200).json(responseModel)
            }
        })
}

function _mine(req, res) {
    profileService.readByUserId(req.params.id)
        .then(profiles => {
            const responseModel = new responses.ItemsResponse()
            responseModel.items = profiles
            res.json(responseModel)
        })
        .catch(err => {
            console.log(err)
            res.status(500).send(new responses.ErrorResponse(err))
        })
}

function create(req, res) {
    req.model.userId = req.auth.userId
    req.model.isPending = undefined
    if (((req.model.menteeId !== null) || (req.model.locationId !== null) || (req.model.institutionId !== null)) && !req.query.key) {
        req.model.isPending = true
    }
    if (req.model.isSuperAdmin == true || req.query.key) {
        req.model.isPending = false
    }
    profileService.create(req.model)
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

function update(req, res) {
    profileService
        .update(req.params.id, req.model)
        .then(profile => {
            const responseModel = new responses.SuccessResponse()
            res.status(200).json(responseModel)
        })
        .catch(err => {
            console.log(err)
            res.status(500).send(new responses.ErrorResponse(err))
        })
}

function _delete(req, res) {
    profileService
        .deactivate(req.params.id)
        .then(() => {
            const responseModel = new responses.SuccessResponse()
            res.status(200).json(responseModel)
        })
        .catch(err => {
            console.log(err)
            return res.status(500).send(new responses.ErrorResponse(err))
        })
}

function _inviteMentor(req, res) {
    profileService.readById(req.params.id)
        .then(mentor => {
            const secret = process.env.HASH_KEY
            const prehashedInfo = req.model.email + "|" + req.auth.profileId
            const hash = crypto.createHmac('sha256', secret)
                .update(prehashedInfo)
                .digest('base64')
            const encodedHash = encodeURIComponent(hash)

            emailsService.sendInviteMentorEmail(req.model.email, req.model.name, req.auth.userDisplayName, req.auth.profileId, encodedHash)
                .then(data => {
                    notificationsAppService.notifyMentorInviteSend(req.model.email, req.auth.profileId, req.params.id).catch(err =>console.log(err))
                    const responseModel = new responses.ItemResponse()
                    res.status(201)
                        .json(responseModel)
                })
                .catch(err => {
                    console.log(err)
                    res.status(500).send(new responses.ErrorResponse(err))
                })
        })
        .catch(err => {
            console.log(err)
            res.status(500).send(new responses.ErrorResponse(err))
        })
}