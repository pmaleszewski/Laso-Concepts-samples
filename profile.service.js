'use strict'

const console = require('console')
const Profile = require('../models/profile')
const mongodb = require('../mongodb')
const conn = mongodb.connection
const ObjectId = mongodb.ObjectId


module.exports = {
    readAll: readAll,
    readById: readById,
    readByProfileIds: readByProfileIds,
    readByLocationIds: readByLocationIds,
    readByInstitutionId: readByInstitutionId,
    readByMenteeId: readByMenteeId,
    create: create,
    update: update,
    deactivate: _deactivate,
    readByUserId: _readByUserId,
    readByMany: readByMany
}

var matchDeactivated = { "dateDeactivated": null }
var addFieldsUser = { $addFields: { user: { $arrayElemAt: ['$user', 0] } } }
var addFieldsAddress = { $addFields: { address: { $arrayElemAt: ['$address', 0] } } }
var addFieldsInstitution = { $addFields: { institution: { $arrayElemAt: ['$institution', 0] } } }
var addFieldsLocation = { $addFields: { location: { $arrayElemAt: ['$location', 0] } } }

var lookupUsers = { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "user" } }
var lookupAddress = { $lookup: { from: 'addresses', localField: 'user.addressId', foreignField: '_id', as: 'address' } }
var lookupInstitution = { $lookup: { from: 'institutions', localField: 'institutionId', foreignField: '_id', as: 'institution' } }
var lookupLocation = { $lookup: { from: 'locations', localField: 'locationId', foreignField: '_id', as: 'location' } }

let locationSteps1 = { $lookup: { from: "locations", localField: '_id', foreignField: 'liveClientIds', as: 'clientLocation' } }
let locationSteps2 = { $addFields: { attendedLocationIds: '$clientLocation._id' } } //David's code



function readMapping(profile) {
    if (profile._id) {
        profile._id = profile._id.toString()
    }
    if (profile.menteeId) {
        profile.menteeId = profile.menteeId.toString()
    }
    if (profile.locationId) {
        profile.locationId = profile.locationId.toString()
    }
    if (profile.institutionId) {
        profile.institutionId = profile.institutionId.toString()
    }
    if (profile.userId) {
        profile.userId = profile.userId.toString() // convert ObjectId back to string
    }
    if (profile.user.addressId) {
        profile.user.addressId = profile.user.addressId.toString()
    }
    if (profile.user.address.id) {
        profile.user.address.id = profile.user.address.id.toString()
    }
    if (profile.attendedLocationIds) {
        for (let l = 0; l < profile.attendedLocationIds.length; l++) { profile.attendedLocationIds[l] = profile.attendedLocationIds[l].toString() }
    } else { profile.attendedLocationIds = [] }
    if (!profile.profileOverrides.imageUrl && !profile.user.defaultImageUrl) {
        profile.profileOverrides.imageUrl = `${process.env.ORIGIN}/img/default-user-profile-img.png`
    }
    return profile
}



function writeMapping(doc, user) {
    let newDoc = {
        profileOverrides: {},
        isSuperAdmin: doc.isSuperAdmin,
        levelOfCare: doc.levelOfCare,
        dateModified: new Date(),
    }

    //profile-user field deltas
    if (doc.profileOverrides.name == user.defaultDisplayName) {
        newDoc.profileOverrides.name = null
    } else { newDoc.profileOverrides.name = doc.profileOverrides.name }
    if (doc.profileOverrides.imageUrl == user.defaultImageUrl) {
        newDoc.profileOverrides.imageUrl = null
    } else { newDoc.profileOverrides.imageUrl = doc.profileOverrides.imageUrl }
    if (doc.profileOverrides.phone == user.defaultPhone) {
        newDoc.profileOverrides.phone = null
    } else { newDoc.profileOverrides.phone = doc.profileOverrides.phone }
    if (doc.profileOverrides.isPhoneVisible == user.defaultIsPhoneVisible) {
        newDoc.profileOverrides.isPhoneVisible = null
    } else { newDoc.profileOverrides.isPhoneVisible = doc.profileOverrides.isPhoneVisible }
    if (doc.userId) {
        newDoc.userId = new ObjectId(doc.userId)
    }
    if (doc.menteeId) {
        newDoc.menteeId = new ObjectId(doc.menteeId)
    }
    if (doc.locationId) {
        newDoc.locationId = new ObjectId(doc.locationId)
    }
    if (doc.institutionId) {
        newDoc.institutionId = new ObjectId(doc.institutionId)
    }
    return newDoc
}

function readAll(singleUserId, queryParams, admin) {
    let searchParams
    if (singleUserId) { searchParams = { "userId": new ObjectId(singleUserId) } }
    else { searchParams = { dateDeactivated: null } }
    let skip
    let limit = 20
    if (!queryParams) {
        queryParams = {}
    }
    if (!queryParams.page) {
        queryParams.page = 1
    }
    if (queryParams.page == -1) {
        skip = 0
        limit = Number.MAX_SAFE_INTEGER
    } else {
        skip = (queryParams.page - 1) * 20
    }
    let aggregateList = [
        { $skip: skip },
        { $limit: limit },
        lookupUsers,
        addFieldsUser,
        lookupAddress,
        addFieldsAddress,
        lookupInstitution,
        addFieldsInstitution,
        lookupLocation,
        addFieldsLocation,
        {
            $project: {
                '_id': 1,
                "isSuperAdmin": 1,
                profileOverrides: {
                    name: 1,
                    imageUrl: 1,
                    phone: {
                        $cond: {
                            if: '$profileOverrides.isPhoneVisible',
                            then: '$profileOverrides.phone',
                            else: admin ? '$profileOverrides.phone' : undefined
                        }
                    },
                    isPhoneVisible: 1
                },
                "menteeId": 1,
                "locationId": 1,
                "institutionId": 1,
                "userId": 1,
                "isPending": 1,
                'dateCreated': 1,
                'dateModified': 1,
                'dateDeactivated': 1,
                user: {
                    id: '$userId',
                    username: 1,
                    defaultDisplayName: 1,
                    defaultImageUrl: 1,
                    addressId: 1,
                    address: {
                        id: '$address._id',
                        line1: '$address.line1',
                        line2: '$address.line2',
                        city: '$address.city',
                        stateCode: '$address.stateCode',
                        postalCode: '$address.postalCode'
                    }
                },
                institution: {
                    id: '$institutionId',
                    name: 1,
                    imageUrl: 1,
                    profileId: 1
                },
                location: {
                    id: '$locationId',
                    name: '$location.name',
                    imageUrl: '$location.imageUrl',
                    profileId: '$location.profileId'
                },
                attendedLocationIds: 1
            }
        }]
    if (queryParams) {
        if (queryParams.type == "client") {
            searchParams.menteeId = null
            searchParams.locationId = null
            searchParams.institutionId = null
            searchParams.isSuperAdmin = false
        }
        if (queryParams.requestLocation) {
            aggregateList.splice(10, 0, locationSteps1, locationSteps2)
        }
    }
    return conn.db().collection('profiles').aggregate([
        { $match: searchParams },
        { $sort: { "dateCreated": -1 } },
        {
            $facet: {
                count: [{ $count: 'count' }],
                profiles: aggregateList
            }
        },
        { $project: { count: { $arrayElemAt: ['$count', 0] }, profiles: 1 } },
        {
            $project: { count: '$count.count', profiles: 1 }
        }]).toArray()
        .then(profileArray => {
            profileArray = profileArray[0]
            profileArray.profiles.map(readMapping)
            return profileArray
        })
        .catch(data => console.log('fix this login error on profile service'))
}

// READ BY SINGLE PROFILE ID
function readById(id, requestLocation, admin) { //join the 'profile' document with the 'user' document associated with the same ObjectId
    let aggregateList = [
        { $match: { $and: [matchDeactivated, { "_id": new ObjectId(id) }] } },
        lookupUsers,
        addFieldsUser,
        lookupAddress,
        addFieldsAddress,
        lookupInstitution,
        addFieldsInstitution,
        lookupLocation,
        addFieldsLocation,
        {
            $project: {
                '_id': 1,
                "isSuperAdmin": 1,
                profileOverrides: {
                    name: 1,
                    imageUrl: 1,
                    phone: {
                        $cond: {
                            if: '$profileOverrides.isPhoneVisible',
                            then: '$profileOverrides.phone',
                            else: admin ? '$profileOverrides.phone' : undefined
                        }
                    },
                    isPhoneVisible: 1
                },
                "menteeId": 1,
                "locationId": 1,
                "institutionId": 1,
                "userId": 1,
                "levelOfCare": 1,
                "isPending": 1,
                'dateCreated': 1,
                'dateModified': 1,
                'dateDeactivated': 1,
                user: {
                    id: '$userId',
                    username: 1,
                    defaultDisplayName: 1,
                    defaultImageUrl: 1,
                    addressId: 1,
                    address: {
                        id: '$address._id',
                        line1: '$address.line1',
                        line2: '$address.line2',
                        city: '$address.city',
                        stateCode: '$address.stateCode',
                        postalCode: '$address.postalCode'
                    }
                },
                institution: {
                    id: '$institutionId',
                    name: 1,
                    imageUrl: 1,
                    profileId: 1
                },
                location: {
                    id: '$locationId',
                    name: '$location.name',
                    imageUrl: '$location.imageUrl',
                    profileId: '$location.profileId'
                },
                attendedLocationIds: 1
            }
        }
    ]
    if (requestLocation) {
        aggregateList.splice(9, 0, locationSteps1, locationSteps2)
    }
    return conn.db().collection('profiles').aggregate(aggregateList).toArray()
        .then(profile => {
            if (!profile.length) {
                return null
            } else {
                return readMapping(profile[0])
            }
        })
}


// READ BY MULTIPLE PROFILE IDS
function readByProfileIds(allIds) {
    var idArray = []
    for (var i = 0; i < allIds.length; i++) {
        idArray.push(new ObjectId(allIds[i]))
    }
    let query = { "dateDeactivated": null, _id: { $in: idArray } }
    let aggregateList = [
        { $match: query },
        lookupUsers,
        addFieldsUser,
        lookupAddress,
        addFieldsAddress,
        lookupInstitution,
        addFieldsInstitution,
        lookupLocation,
        addFieldsLocation,
        {
            $project: {
                '_id': 1,
                "isSuperAdmin": 1,
                profileOverrides: {
                    name: 1,
                    imageUrl: 1,
                    phone: {
                        $cond: {
                            if: '$profileOverrides.isPhoneVisible',
                            then: '$profileOverrides.phone',
                            else: 'N/A'
                        }
                    },
                    isPhoneVisible: 1
                },
                "menteeId": 1,
                "locationId": 1,
                "institutionId": 1,
                "userId": 1,
                "isPending": 1,
                'dateCreated': 1,
                'dateModified': 1,
                'dateDeactivated': 1,
                user: {
                    id: '$userId',
                    username: 1,
                    defaultDisplayName: 1,
                    defaultImageUrl: 1,
                    addressId: 1,
                    address: {
                        id: '$address._id',
                        line1: '$address.line1',
                        line2: '$address.line2',
                        city: '$address.city',
                        stateCode: '$address.stateCode',
                        postalCode: '$address.postalCode'
                    }
                },
                institution: {
                    id: '$institutionId',
                    name: 1,
                    imageUrl: 1,
                    profileId: 1
                },
                location: {
                    id: '$locationId',
                    name: '$location.name',
                    imageUrl: '$location.imageUrl',
                    profileId: '$location.profileId',
                    institutionId: '$location.institutionId',
                    liveClientIds: '$location.liveClientIds'
                },
                attendedLocationIds: 1
            }
        }]
    return conn.db().collection('profiles').aggregate(aggregateList).toArray()
        .then(profileArray => {
            profileArray.map(readMapping)
            return profileArray
        })
        .catch(data => console.log('read by ProfileIds error'))
}

// READ BY LOCATIONS IDS
function readByLocationIds(locationIds) {
    var idArray = []
    for (var i = 0; i < locationIds.length; i++) {
        idArray.push(ObjectId(locationIds[i]))
    }
    let query = { "dateDeactivated": null, locationId: { $in: idArray } }
    let aggregateList = [
        { $match: query },
        lookupUsers,
        addFieldsUser,
        lookupAddress,
        addFieldsAddress,
        lookupInstitution,
        addFieldsInstitution,
        lookupLocation,
        addFieldsLocation,
        {
            $project: {
                '_id': 1,
                "isSuperAdmin": 1,
                profileOverrides: {
                    name: 1,
                    imageUrl: 1,
                    phone: {
                        $cond: {
                            if: '$profileOverrides.isPhoneVisible',
                            then: '$profileOverrides.phone',
                            else: 'N/A'
                        }
                    },
                    isPhoneVisible: 1
                },
                "menteeId": 1,
                "locationId": 1,
                "institutionId": 1,
                "userId": 1,
                "isPending": 1,
                'dateCreated': 1,
                'dateModified': 1,
                'dateDeactivated': 1,
                user: {
                    id: '$userId',
                    username: 1,
                    defaultDisplayName: 1,
                    defaultImageUrl: 1,
                    addressId: 1,
                    address: {
                        id: '$address._id',
                        line1: '$address.line1',
                        line2: '$address.line2',
                        city: '$address.city',
                        stateCode: '$address.stateCode',
                        postalCode: '$address.postalCode'
                    }
                },
                institution: {
                    id: '$institutionId',
                    name: 1,
                    imageUrl: 1,
                    profileId: 1
                },
                location: {
                    id: '$locationId',
                    name: '$location.name',
                    imageUrl: '$location.imageUrl',
                    profileId: '$location.profileId',
                    institutionId: '$location.institutionId',
                    liveClientIds: '$location.liveClientIds'
                },
                attendedLocationIds: 1
            }
        }]
    return conn.db().collection('profiles').aggregate(aggregateList).toArray()
        .then(profileArray => {
            profileArray.map(readMapping)
            console.log(profileArray)
            return profileArray
        })
        .catch(data => console.log('read locationIds error in profile Service'))
}

// READ BY MENTEE ID
function readByMenteeId(menteeId) {
    let searchParams = { 'menteeId': ObjectId(menteeId), 'dateDeactivated': null }
    var aggregateList = [
        { $match: searchParams },
        lookupUsers,
        addFieldsUser,
        lookupAddress,
        addFieldsAddress,
        lookupInstitution,
        addFieldsInstitution,
        lookupLocation,
        addFieldsLocation,
        {
            $project: {
                '_id': 1,
                "isSuperAdmin": 1,
                profileOverrides: {
                    name: 1,
                    imageUrl: 1,
                    phone: {
                        $cond: {
                            if: '$profileOverrides.isPhoneVisible',
                            then: '$profileOverrides.phone',
                            else: 'N/A'
                        }
                    },
                    isPhoneVisible: 1
                },
                "menteeId": 1,
                "locationId": 1,
                "institutionId": 1,
                "userId": 1,
                "isPending": 1,
                'dateCreated': 1,
                'dateModified': 1,
                'dateDeactivated': 1,
                user: {
                    id: '$userId',
                    username: 1,
                    defaultDisplayName: 1,
                    defaultImageUrl: 1,
                    addressId: 1,
                    address: {
                        id: '$address._id',
                        line1: '$address.line1',
                        line2: '$address.line2',
                        city: '$address.city',
                        stateCode: '$address.stateCode',
                        postalCode: '$address.postalCode'
                    }
                },
                institution: {
                    id: '$institutionId',
                    name: 1,
                    imageUrl: 1,
                    profileId: 1
                },
                location: {
                    id: '$locationId',
                    name: '$location.name',
                    imageUrl: '$location.imageUrl',
                    profileId: '$location.profileId',
                    institutionId: '$location.institutionId',
                    liveClientIds: '$location.liveClientIds'
                },
                attendedLocationIds: 1
            }
        }]
    return conn.db().collection('profiles').aggregate(aggregateList).toArray()
        .then(profileArray => {
            profileArray.map(readMapping)
            return profileArray
        })
        .catch(data => console.log('read menteeIds error in profile Service'))
}


// READ BY INSTITUTION ID
function readByInstitutionId(institutionIdObj) {
    let query = { "dateDeactivated": null, institutionId: ObjectId(institutionIdObj) }
    var aggregateList = [
        { $match: query },
        lookupUsers,
        addFieldsUser,
        lookupAddress,
        addFieldsAddress,
        lookupInstitution,
        addFieldsInstitution,
        lookupLocation,
        addFieldsLocation,
        {
            $project: {
                '_id': 1,
                "isSuperAdmin": 1,
                profileOverrides: {
                    name: 1,
                    imageUrl: 1,
                    phone: {
                        $cond: {
                            if: '$profileOverrides.isPhoneVisible',
                            then: '$profileOverrides.phone',
                            else: 'N/A'
                        }
                    },
                    isPhoneVisible: 1
                },
                "menteeId": 1,
                "locationId": 1,
                "institutionId": 1,
                "userId": 1,
                "isPending": 1,
                'dateCreated': 1,
                'dateModified': 1,
                'dateDeactivated': 1,
                user: {
                    id: '$userId',
                    username: 1,
                    defaultDisplayName: 1,
                    defaultImageUrl: 1,
                    addressId: 1,
                    address: {
                        id: '$address._id',
                        line1: '$address.line1',
                        line2: '$address.line2',
                        city: '$address.city',
                        stateCode: '$address.stateCode',
                        postalCode: '$address.postalCode'
                    }
                },
                institution: {
                    id: '$institutionId',
                    name: 1,
                    imageUrl: 1,
                    profileId: 1
                },
                location: {
                    id: '$locationId',
                    name: '$location.name',
                    imageUrl: '$location.imageUrl',
                    profileId: '$location.profileId',
                    institutionId: '$location.institutionId',
                    liveClientIds: '$location.liveClientIds'
                },
                attendedLocationIds: 1
            }
        }]
    return conn.db().collection('profiles').aggregate(aggregateList).toArray()
        .then(profileArray => {
            // profileArray = profileArray[0]
            profileArray.map(readMapping)
            return profileArray
        })
        .catch(data => console.log('read institutionIds error in profile Service'))
}

// CREATE
function create(model) {
    return conn.db().collection('users').findOne({ _id: new ObjectId(model.userId), 'dateDeactivated': null })
        .then(user => {
            let doc = writeMapping(model, user)
            doc.dateCreated = new Date()
            doc.dateDeactivated = null
            return conn.db().collection('profiles').insert(doc)
        })
        .then(id => id.insertedIds[0].toString())
}

// UPDATE
function update(id, doc) {
    return conn.db().collection('profiles').aggregate([
        { $match: { "dateDeactivated": null, "_id": new ObjectId(doc._id) } },
        lookupUsers,
        addFieldsUser,
        {
            $project: {
                '_id': 1,
                user: {
                    id: '$userId',
                    username: '$user.username',
                    defaultDisplayName: '$user.defaultDisplayName',
                    defaultImageUrl: '$user.defaultImageUrl',
                    defaultIsPhoneVisible: '$user.defaultIsPhoneVisible',
                    defaultPhone: '$user.defaultPhone',
                }
            },
        }
    ]).toArray() //This aggregation is necessary because update profile objects do not have userIds.  We cannot take it from req.auth because different users can update profiles.
        .then(profile => {
            let newDoc = writeMapping(doc, profile[0].user)
            return conn.db().collection('profiles').updateOne({ _id: ObjectId(id) }, { $set: newDoc })
        })
        .then(result => Promise.resolve())
} // "return" nothing

function _deactivate(id) {
    return conn.db().collection('profiles').updateOne({ _id: ObjectId(id) }, { $currentDate: { 'dateModified': true, 'dateDeactivated': true } })
        .then(result => Promise.resolve()) // "return" nothing
}

// READ BY USER ID
function _readByUserId(id) {
    return conn.db().collection('profiles').aggregate([
        { $match: { 'userId': ObjectId(id), "dateDeactivated": null } },
        { $sort: { dateCreated: 1, dateModified: 1 } },
        {
            $lookup: {
                from: 'profiles',
                localField: 'menteeId',
                foreignField: '_id',
                as: 'mentee'
            }
        },
        { $unwind: { path: '$mentee', preserveNullAndEmptyArrays: true } },
        {
            $lookup: {
                from: 'institutions',
                localField: 'institutionId',
                foreignField: '_id',
                as: 'institution'
            }
        },
        { $unwind: { path: '$institution', preserveNullAndEmptyArrays: true } },
        {
            $lookup: {
                from: 'locations',
                localField: 'locationId',
                foreignField: '_id',
                as: 'location'
            }
        },
        { $unwind: { path: '$location', preserveNullAndEmptyArrays: true } },
        {
            $lookup: {
                from: "locations",
                localField: '_id',
                foreignField: 'liveClientIds',
                as: 'clientLocation'
            }
        },
        {
            $project: {
                _id: 1,
                clientLocation: 1,
                mentee: {
                    $cond: {
                        if: '$mentee._id',
                        then: {
                            menteeId: '$mentee._id',
                            name: '$mentee.profileOverrides.name'
                        },
                        else: null
                    }
                },
                location: {
                    $cond: {
                        if: '$location._id',
                        then: {
                            locationId: '$location._id',
                            name: '$location.name'
                        },
                        else: null
                    }
                },
                institution: {
                    $cond: {
                        if: '$institution._id',
                        then: {
                            institutionId: '$institution._id',
                            name: '$institution.name',
                        },
                        else: null
                    }
                },
                isSuperAdmin: 1,
            }
        }
    ]).toArray()
        .then(profileArray => {
            for (let i = 0; i < profileArray.length; i++) {
                let profile = profileArray[i]
                profile._id = profile._id.toString()
                if (profile.institution == null) {
                    delete profile.institution
                } else {
                    profile.institution.institutionId = profile.institution.institutionId.toString()
                }
                if (profile.mentee == null) {
                    delete profile.mentee
                } else {
                    profile.mentee.menteeId = profile.mentee.menteeId.toString()
                }
                if (profile.location == null) {
                    delete profile.location
                } else {
                    profile.location.locationId = profile.location.locationId.toString()
                }
                if (profile.clientLocation.length > 0) {
                    for (let x = 0; x < profile.clientLocation.length; x++) {
                        profile.clientLocation[x] = {
                            locationId: profile.clientLocation[x]._id.toString(),
                            name: profile.clientLocation[x].name
                        }
                    }
                } else {
                    delete profile.clientLocation
                }
            }
            return profileArray
        })
}

function readByMany (arr) {
    let obj_ids = arr.map( id => ObjectId(id))
    return conn.db().collection('profiles').aggregate([
        {$match:
            { _id: {$in: obj_ids} }
        },
        {$lookup:
            {
                from: 'institutions',
                localField: 'institutionId',
                foreignField: '_id',
                as: 'institution'
            }
        },
        {$addFields:
            {institutions:
                {$arrayElemAt: ['$institution', 0] }
            }
        },
        {$lookup:
            {
                from: 'locations',
                localField: 'locationId',
                foreignField: '_id',
                as: 'location'
            }
        },
        {$addFields:
            {locations:
                {$arrayElemAt: ['$location', 0] }
            }
        },
        {$lookup:
            {
                from: 'users',
                localField: 'userId',
                foreignField: '_id',
                as: 'user'
            }
        },
        {$addFields:
            {users:
                {$arrayElemAt: ['$user', 0] }
            }
        }
        ,
        {$lookup:
            {
                from: 'addresses',
                localField: 'users.addressId',
                foreignField: '_id',
                as: 'address'
            }
        },
        {$addFields:
            {users:
                {$arrayElemAt: ['$address', 0] }
            }
        }

    ]).toArray().then(arr => arr)
}